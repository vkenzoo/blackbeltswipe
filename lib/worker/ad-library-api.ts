/**
 * ad-library-api — cliente da Meta Ad Library API oficial
 *
 * Endpoint: https://graph.facebook.com/v21.0/ads_archive
 * Docs:     https://www.facebook.com/ads/library/api/
 *
 * Requisitos:
 *   - Identity confirmation aprovada na conta Facebook (facebook.com/id)
 *   - Access token com scope público (USER token de app qualquer)
 *   - Env var META_ACCESS_TOKEN configurada
 *
 * Vantagens vs scraping:
 *   - 100-300× mais rápido (~100ms vs 30s)
 *   - JSON estruturado, sem risco de quebra de layout
 *   - Metadata adicional: ad_creation_time, publisher_platforms, snapshot_url
 *   - Zero risco de rate limit ou block (rate oficial: 200 calls/hora)
 *
 * Limitações conhecidas:
 *   - Anúncios **não-políticos** fora de EU/UK/US com DSA: podem não aparecer
 *   - Ads com idade > 7 anos não retornam
 *   - Alguns anúncios segmentados podem não aparecer em `ad_active_status=ACTIVE`
 */

const API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export type AdLibraryAd = {
  id: string;
  ad_creation_time?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string | null;
  ad_snapshot_url?: string;
  page_id?: string;
  page_name?: string;
  publisher_platforms?: string[];
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_titles?: string[];
  languages?: string[];
  currency?: string;
};

export type AdCountResult = {
  /** Total de ads ativos encontrados (ou null se a API bloqueou/erro) */
  count: number | null;
  /** Amostra dos primeiros ads (útil pra extrair criativos depois) */
  ads: AdLibraryAd[];
  /** Se true, API retornou error (identity not confirmed, etc) */
  blocked: boolean;
  /** Mensagem de erro se houver */
  error?: string;
  /** Set de page_ids únicos que apareceram nos resultados. Crítico pra
   * domain search que agrega múltiplas Pages do mesmo advertiser. */
  page_ids?: string[];
  /** Count por page_id (útil pra threshold de spam / ranking) */
  count_by_page_id?: Record<string, number>;
};

// Campos retornados em TODAS as queries (compartilhado entre page_id e search)
const DEFAULT_FIELDS = [
  "id",
  "ad_creation_time",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_snapshot_url",
  "page_id",
  "page_name",
  "publisher_platforms",
  "ad_creative_bodies",
  "languages",
].join(",");

/** Context opcional pra logar qual handler/oferta disparou a chamada */
export type ApiCallContext = {
  caller_handler?: string;
  offer_id?: string;
};

/**
 * Grava meta_api_calls row de forma fire-and-forget.
 * Lazy import do supabase pra não acoplar ao client em outros contextos.
 */
async function logApiCall(row: {
  search_page_ids?: string;
  search_terms?: string;
  ad_active_status?: string;
  ad_reached_countries?: string;
  ads_returned?: number;
  pages_fetched?: number;
  response_time_ms: number;
  http_status?: number;
  error_code?: number;
  error_subcode?: number;
  error_message?: string;
  caller_handler?: string;
  offer_id?: string;
}): Promise<void> {
  try {
    // Lazy import + service role (worker contexto)
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    // Sanitize error_message pra não gravar tokens/keys em log persistente.
    // Meta às vezes ecoa parte do token em mensagens de erro.
    const { sanitizeLogMessage } = await import("@/lib/security");
    const sanitized = {
      ...row,
      error_message: row.error_message
        ? sanitizeLogMessage(row.error_message)
        : row.error_message,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("meta_api_calls") as any).insert(sanitized);
  } catch {
    // Silent — log não deve quebrar o worker
  }
}

/**
 * Core fetch — aceita qualquer combinação de params da API Ad Library.
 * Faz pagination até MAX_PAGES. Retorna AdCountResult normalizado.
 *
 * Grava cada chamada em meta_api_calls pra dashboard admin.
 */
async function fetchAdsCore(
  extraParams: Record<string, string>,
  token?: string,
  limit = 25,
  context?: ApiCallContext
): Promise<AdCountResult> {
  // Prioridade: token explícito > banco (editável via /admin/meta-api) > env
  let accessToken = token;
  if (!accessToken) {
    const { getMetaAccessToken } = await import("@/lib/meta-token");
    accessToken = (await getMetaAccessToken()) ?? undefined;
  }
  if (!accessToken) {
    await logApiCall({
      search_page_ids: extraParams.search_page_ids,
      search_terms: extraParams.search_terms,
      ad_reached_countries: extraParams.ad_reached_countries,
      response_time_ms: 0,
      error_message: "META_ACCESS_TOKEN não configurado",
      caller_handler: context?.caller_handler,
      offer_id: context?.offer_id,
    });
    return {
      count: null,
      ads: [],
      blocked: true,
      error: "META_ACCESS_TOKEN não configurado",
    };
  }

  const params = new URLSearchParams({
    ...extraParams,
    ad_active_status: "ACTIVE",
    fields: DEFAULT_FIELDS,
    limit: String(Math.min(100, limit)),
    access_token: accessToken,
  });

  const url = `${BASE_URL}/ads_archive?${params.toString()}`;
  const allAds: AdLibraryAd[] = [];
  let nextUrl: string | null = url;
  let pages = 0;
  const MAX_PAGES = 10;
  const t0 = Date.now();
  let lastHttpStatus: number | undefined;

  try {
    while (nextUrl && pages < MAX_PAGES) {
      // eslint-disable-next-line no-await-in-loop
      const res: Response = await fetch(nextUrl);
      lastHttpStatus = res.status;
      // eslint-disable-next-line no-await-in-loop
      const json: {
        data?: AdLibraryAd[];
        paging?: { next?: string };
        error?: { message: string; code: number; error_subcode?: number };
      } = await res.json();

      if (json.error) {
        const elapsed = Date.now() - t0;
        await logApiCall({
          search_page_ids: extraParams.search_page_ids,
          search_terms: extraParams.search_terms,
          ad_active_status: "ACTIVE",
          ad_reached_countries: extraParams.ad_reached_countries,
          pages_fetched: pages,
          response_time_ms: elapsed,
          http_status: lastHttpStatus,
          error_code: json.error.code,
          error_subcode: json.error.error_subcode,
          error_message: json.error.message,
          caller_handler: context?.caller_handler,
          offer_id: context?.offer_id,
        });

        // Se é token expirado/inválido (190/463/467), marca no banco pra UI
        // avisar admin em /admin/meta-api + badge no sidebar.
        if ([190, 463, 467].includes(json.error.code)) {
          try {
            const { markMetaTokenInvalid } = await import("@/lib/meta-token");
            await markMetaTokenInvalid(
              `code=${json.error.code}: ${json.error.message}`
            );
          } catch {
            /* silent */
          }
        }

        return {
          count: null,
          ads: [],
          blocked: true,
          error: `${json.error.message} (code=${json.error.code}${json.error.error_subcode ? `/${json.error.error_subcode}` : ""})`,
        };
      }

      if (Array.isArray(json.data)) {
        allAds.push(...json.data);
      }

      nextUrl = json.paging?.next ?? null;
      pages++;
    }

    // Aggrega page_ids únicos + count por page_id (útil pra domain search)
    const countByPageId: Record<string, number> = {};
    for (const ad of allAds) {
      if (ad.page_id) {
        countByPageId[ad.page_id] = (countByPageId[ad.page_id] ?? 0) + 1;
      }
    }

    const elapsed = Date.now() - t0;
    await logApiCall({
      search_page_ids: extraParams.search_page_ids,
      search_terms: extraParams.search_terms,
      ad_active_status: "ACTIVE",
      ad_reached_countries: extraParams.ad_reached_countries,
      ads_returned: allAds.length,
      pages_fetched: pages,
      response_time_ms: elapsed,
      http_status: lastHttpStatus,
      caller_handler: context?.caller_handler,
      offer_id: context?.offer_id,
    });

    return {
      count: allAds.length,
      ads: allAds.slice(0, limit),
      blocked: false,
      page_ids: Object.keys(countByPageId),
      count_by_page_id: countByPageId,
    };
  } catch (err) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    await logApiCall({
      search_page_ids: extraParams.search_page_ids,
      search_terms: extraParams.search_terms,
      ad_active_status: "ACTIVE",
      ad_reached_countries: extraParams.ad_reached_countries,
      pages_fetched: pages,
      response_time_ms: elapsed,
      http_status: lastHttpStatus,
      error_message: msg,
      caller_handler: context?.caller_handler,
      offer_id: context?.offer_id,
    });
    return {
      count: null,
      ads: [],
      blocked: true,
      error: msg,
    };
  }
}

/**
 * Busca contagem de ads ativos pra uma page_id + país.
 */
export async function fetchActiveAdsByPage(
  pageId: string,
  countries: string[] = ["BR"],
  token?: string,
  limit = 25,
  context?: ApiCallContext
): Promise<AdCountResult> {
  return fetchAdsCore(
    {
      search_page_ids: pageId,
      ad_reached_countries: JSON.stringify(countries),
    },
    token,
    limit,
    context
  );
}

/**
 * Busca ads ativos por search_terms (keyword/domínio) — usado como fallback
 * quando page_id fica stale e precisa descobrir nova Page via o domínio da
 * landing.
 *
 * Exemplo: fetchActiveAdsBySearchTerms("techpauloborges.com", ["BR"])
 * → agrega ads de TODAS as Pages que estão rodando o domínio.
 *
 * Meta aceita esse param no endpoint (comprovado via UI da Ad Library) mas
 * não documenta formalmente. Se a API rejeitar, retorna { blocked: true } e
 * o caller cai pro scraping via Playwright.
 */
export async function fetchActiveAdsBySearchTerms(
  searchTerms: string,
  countries: string[] = ["BR"],
  token?: string,
  limit = 100,
  context?: ApiCallContext
): Promise<AdCountResult> {
  return fetchAdsCore(
    {
      search_terms: searchTerms,
      ad_reached_countries: JSON.stringify(countries),
    },
    token,
    limit,
    context
  );
}

/**
 * Extrai page_id de uma URL de Ad Library pública.
 *
 * Patterns suportados:
 *   - https://www.facebook.com/ads/library/?view_all_page_id=12345
 *   - https://www.facebook.com/ads/library/?active_status=all&id=...&view_all_page_id=12345
 */
export function extractPageIdFromUrl(url: string): string | null {
  const m = url.match(/view_all_page_id=(\d+)/);
  return m ? m[1] : null;
}

/**
 * Helper pra saber se o feature flag tá ativo.
 * Controlado via env var USE_AD_LIBRARY_API=true
 */
export function isApiEnabled(): boolean {
  return (
    process.env.USE_AD_LIBRARY_API === "true" &&
    !!process.env.META_ACCESS_TOKEN
  );
}
