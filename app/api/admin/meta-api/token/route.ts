/**
 * POST /api/admin/meta-api/token
 *
 * Body:
 *   { action: "set", token: string, expires_at?: string }
 *     → Salva token no banco (o admin já fez o exchange manualmente)
 *
 *   { action: "exchange", short_token: string }
 *     → Faz exchange pro long-lived token (60 dias) e salva
 *
 *   { action: "validate" }
 *     → Testa o token atual contra a Meta API e atualiza last_validated_at
 *
 * GET /api/admin/meta-api/token
 *     → Retorna config sem o token (só metadata: expires_at, last_validated_at)
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getMetaConfig,
  setMetaAccessToken,
  exchangeForLongLivedToken,
  markMetaTokenValid,
  markMetaTokenInvalid,
  getMetaAccessToken,
} from "@/lib/meta-token";

export async function GET() {
  const user = await requireAdmin();
  const cfg = await getMetaConfig();
  if (!cfg) return NextResponse.json({ configured: false });

  // Nunca retorna o token — só metadata
  const envFallback = !cfg.access_token && !!process.env.META_GRAPH_ACCESS_TOKEN;
  const hasToken = !!cfg.access_token || envFallback;

  // Calcula dias até expirar
  let days_until_expiry: number | null = null;
  if (cfg.expires_at) {
    const ms = new Date(cfg.expires_at).getTime() - Date.now();
    days_until_expiry = Math.max(0, Math.round(ms / 86_400_000));
  }

  // Mascara o token pro preview (mostra só primeiros/últimos chars)
  let token_preview: string | null = null;
  const visibleToken = cfg.access_token ?? process.env.META_GRAPH_ACCESS_TOKEN ?? null;
  if (visibleToken && visibleToken.length > 20) {
    token_preview = `${visibleToken.slice(0, 8)}…${visibleToken.slice(-6)}`;
  }

  return NextResponse.json({
    configured: hasToken,
    source: cfg.access_token ? "database" : envFallback ? "env" : "none",
    token_preview,
    expires_at: cfg.expires_at,
    days_until_expiry,
    last_validated_at: cfg.last_validated_at,
    last_error: cfg.last_error,
    invalid_since: cfg.invalid_since,
    updated_at: (cfg as { updated_at?: string }).updated_at ?? null,
    user_email: user.email,
  });
}

export async function POST(req: Request) {
  const user = await requireAdmin();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action = body.action as string | undefined;

  // ── action: set ──
  if (action === "set") {
    const token = (body.token as string)?.trim();
    if (!token || token.length < 20) {
      return NextResponse.json(
        { error: "token_muito_curto", message: "Token inválido" },
        { status: 400 }
      );
    }
    const expiresAt =
      typeof body.expires_at === "string" ? body.expires_at : null;

    const res = await setMetaAccessToken({
      token,
      expires_at: expiresAt,
      updated_by: user.id,
    });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "set" });
  }

  // ── action: exchange ──
  if (action === "exchange") {
    const shortToken = (body.short_token as string)?.trim();
    if (!shortToken) {
      return NextResponse.json(
        { error: "short_token_missing" },
        { status: 400 }
      );
    }

    const exchange = await exchangeForLongLivedToken(shortToken);
    if (!exchange.ok) {
      return NextResponse.json(
        { error: "exchange_failed", message: exchange.error },
        { status: 400 }
      );
    }

    const expiresAt = new Date(
      Date.now() + exchange.expires_in * 1000
    ).toISOString();

    const save = await setMetaAccessToken({
      token: exchange.token,
      expires_at: expiresAt,
      updated_by: user.id,
    });
    if (!save.ok) {
      return NextResponse.json({ error: save.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      action: "exchange",
      expires_at: expiresAt,
      expires_in_days: Math.round(exchange.expires_in / 86400),
    });
  }

  // ── action: validate ──
  if (action === "validate") {
    const token = await getMetaAccessToken();
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "no_token_configured" },
        { status: 400 }
      );
    }

    try {
      const url = new URL("https://graph.facebook.com/v21.0/me");
      url.searchParams.set("access_token", token);
      const res = await fetch(url.toString());
      const data = (await res.json()) as {
        id?: string;
        name?: string;
        error?: { message: string; code: number };
      };

      if (!res.ok || data.error) {
        const msg = data.error?.message ?? `HTTP ${res.status}`;
        await markMetaTokenInvalid(msg);
        return NextResponse.json({
          ok: false,
          valid: false,
          error: msg,
        });
      }

      await markMetaTokenValid();
      return NextResponse.json({
        ok: true,
        valid: true,
        name: data.name,
        id: data.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network_error";
      return NextResponse.json(
        { ok: false, valid: false, error: msg },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
