import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/events/log
 * Body: { kind: string, payload?: Record<string, unknown> }
 *
 * Loga um evento do user autenticado em user_events.
 *
 * Extrai user_agent + ip_address dos headers automaticamente.
 * Silent fail — não retorna erro detalhado pra client, pra não bloquear
 * fluxos críticos (login, logout) se o log falhar.
 */
export async function POST(req: NextRequest) {
  try {
    // Identifica o user autenticado (anon client respeita session cookie)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      kind?: string;
      payload?: Record<string, unknown>;
    };

    if (!body.kind || typeof body.kind !== "string" || body.kind.length > 64) {
      return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
    }

    // Extrai metadata do request
    const userAgent = req.headers.get("user-agent")?.slice(0, 512) ?? null;
    // IP pode vir em x-forwarded-for (vercel/proxies) ou CF-connecting-ip
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      req.headers.get("cf-connecting-ip") ??
      null;

    // Usa service role pra insert (ignora RLS, é trusted server-side)
    const service = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (service as any).from("user_events").insert({
      user_id: user.id,
      kind: body.kind,
      payload: body.payload ?? {},
      user_agent: userAgent,
      ip_address: ip,
    });

    if (error) {
      console.warn("[events/log] insert error:", error.message);
      return NextResponse.json({ error: "log_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.warn("[events/log] fatal:", err);
    return NextResponse.json({ error: "log_failed" }, { status: 500 });
  }
}
