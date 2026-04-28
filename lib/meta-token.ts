/**
 * Helper pra buscar o access_token do Meta API.
 *
 * Prioridade:
 *   1. Tabela meta_api_config (editável via UI /admin/meta-api)
 *   2. process.env.META_ACCESS_TOKEN (fallback pra dev/boot inicial)
 *
 * Worker usa esse helper em TODAS as chamadas — trocar token via UI
 * entra em efeito na próxima call sem restart.
 */

import { createServiceClient } from "@/lib/supabase/server";

type MetaConfig = {
  access_token: string | null;
  expires_at: string | null;
  last_validated_at: string | null;
  last_error: string | null;
  invalid_since: string | null;
};

// Cache in-memory com TTL curto — evita query em cada call dentro do worker
let cached: { token: string | null; at: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30s

export async function getMetaAccessToken(): Promise<string | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.token;
  }

  try {
    const supa = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supa as any)
      .from("meta_api_config")
      .select("access_token")
      .eq("id", 1)
      .maybeSingle();

    const fromDb = (data as { access_token?: string | null } | null)?.access_token ?? null;
    const fromEnv = process.env.META_ACCESS_TOKEN ?? null;
    const final = fromDb || fromEnv;

    cached = { token: final, at: Date.now() };
    return final;
  } catch (err) {
    // Fallback pro env se banco tá off
    console.warn("[getMetaAccessToken] falha ao ler DB:", err);
    return process.env.META_ACCESS_TOKEN ?? null;
  }
}

export async function getMetaConfig(): Promise<MetaConfig | null> {
  const supa = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supa as any)
    .from("meta_api_config")
    .select("access_token, expires_at, last_validated_at, last_error, invalid_since")
    .eq("id", 1)
    .maybeSingle();
  return (data as MetaConfig) ?? null;
}

/**
 * Salva token novo. Usado pela API admin /api/admin/meta-api/token.
 */
export async function setMetaAccessToken(opts: {
  token: string;
  expires_at?: string | null;
  updated_by?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supa = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supa as any)
    .from("meta_api_config")
    .update({
      access_token: opts.token,
      expires_at: opts.expires_at ?? null,
      updated_at: new Date().toISOString(),
      updated_by: opts.updated_by ?? null,
      last_error: null,
      invalid_since: null,
    })
    .eq("id", 1);

  // Invalida cache in-memory
  cached = null;

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Registra que a Meta rejeitou o token (erro 190/463). Usado pro worker
 * marcar o token como inválido e a UI avisar o admin pra trocar.
 */
export async function markMetaTokenInvalid(errorMsg: string): Promise<void> {
  const supa = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa as any)
    .from("meta_api_config")
    .update({
      last_error: errorMsg.slice(0, 500),
      invalid_since: new Date().toISOString(),
    })
    .eq("id", 1)
    .is("invalid_since", null); // só seta na 1ª vez
  cached = null;
}

/**
 * Marca que o token passou numa call real (pra UI mostrar "tá saudável").
 */
export async function markMetaTokenValid(): Promise<void> {
  const supa = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa as any)
    .from("meta_api_config")
    .update({
      last_validated_at: new Date().toISOString(),
      last_error: null,
      invalid_since: null,
    })
    .eq("id", 1);
}

/**
 * Troca um token user-level curto (2h) por um long-lived (60 dias)
 * via endpoint /oauth/access_token do Meta.
 *
 * Retorna { token, expires_in_seconds } em caso de sucesso.
 */
export async function exchangeForLongLivedToken(
  shortToken: string
): Promise<
  | { ok: true; token: string; expires_in: number }
  | { ok: false; error: string }
> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return {
      ok: false,
      error: "META_APP_ID ou META_APP_SECRET não configurado no .env",
    };
  }

  const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortToken);

  try {
    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message: string; code: number };
    };
    if (!res.ok || data.error) {
      return {
        ok: false,
        error: data.error?.message ?? `HTTP ${res.status}`,
      };
    }
    if (!data.access_token) {
      return { ok: false, error: "resposta sem access_token" };
    }
    return {
      ok: true,
      token: data.access_token,
      expires_in: data.expires_in ?? 0,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "erro desconhecido",
    };
  }
}
