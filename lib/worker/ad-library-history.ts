/**
 * ad-library-history — reconstrução de histórico via Meta Ad Library API.
 *
 * Usa `ad_active_status=ALL` pra pegar ads ativos + inativos de uma Page.
 * Cada ad traz `ad_delivery_start_time` e `ad_delivery_stop_time`, permitindo
 * calcular quantos ads estavam ativos em qualquer dia passado.
 *
 * Lógica de reconstrução:
 *   ad está ativo no dia D se: start_time <= D AND (stop_time IS NULL OR stop_time >= D)
 *
 * Limitações conhecidas:
 *   - Se ad pausou-retomou-pausou, Meta retorna só o último ciclo de start/stop
 *   - Limite 1000 ads por página → paginação até MAX_PAGES
 *   - Ads > 13 meses (não-políticos) podem não retornar
 *   - Fora de EU/UK/US + DSA: cobertura menor
 */

const API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export type HistoryAd = {
  id: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string | null;
  page_id?: string;
};

export type HistoryResult = {
  ads: HistoryAd[];
  pages_fetched: number;
  blocked: boolean;
  error?: string;
  response_time_ms: number;
};

const HISTORY_FIELDS = [
  "id",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "page_id",
].join(",");

async function logApiCall(row: {
  search_page_ids?: string;
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
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
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
    /* silent */
  }
}

/**
 * Busca TODOS os ads (ativos + inativos) de uma Page, paginando até MAX_PAGES.
 * Ideal pra reconstruir histórico dos últimos N dias.
 */
export async function fetchAllAdsByPage(
  pageId: string,
  countries: string[] = ["BR"],
  limit: number = 500,
  context?: { caller_handler?: string; offer_id?: string }
): Promise<HistoryResult> {
  const { getMetaAccessToken } = await import("@/lib/meta-token");
  const accessToken = await getMetaAccessToken();
  if (!accessToken) {
    return {
      ads: [],
      pages_fetched: 0,
      blocked: true,
      error: "META_ACCESS_TOKEN não configurado",
      response_time_ms: 0,
    };
  }

  const params = new URLSearchParams({
    search_page_ids: pageId,
    ad_active_status: "ALL",
    ad_reached_countries: JSON.stringify(countries),
    fields: HISTORY_FIELDS,
    limit: String(Math.min(100, limit)),
    access_token: accessToken,
  });

  const url = `${BASE_URL}/ads_archive?${params.toString()}`;
  const allAds: HistoryAd[] = [];
  let nextUrl: string | null = url;
  let pages = 0;
  const MAX_PAGES = 20; // ALL é mais pesado — permite até 2k ads
  const t0 = Date.now();
  let lastHttpStatus: number | undefined;

  try {
    while (nextUrl && pages < MAX_PAGES) {
      // eslint-disable-next-line no-await-in-loop
      const res: Response = await fetch(nextUrl);
      lastHttpStatus = res.status;
      // eslint-disable-next-line no-await-in-loop
      const json: {
        data?: HistoryAd[];
        paging?: { next?: string };
        error?: { message: string; code: number; error_subcode?: number };
      } = await res.json();

      if (json.error) {
        const elapsed = Date.now() - t0;
        await logApiCall({
          search_page_ids: pageId,
          ad_active_status: "ALL",
          ad_reached_countries: JSON.stringify(countries),
          pages_fetched: pages,
          response_time_ms: elapsed,
          http_status: lastHttpStatus,
          error_code: json.error.code,
          error_subcode: json.error.error_subcode,
          error_message: json.error.message,
          caller_handler: context?.caller_handler,
          offer_id: context?.offer_id,
        });
        return {
          ads: allAds,
          pages_fetched: pages,
          blocked: true,
          error: `${json.error.message} (code=${json.error.code})`,
          response_time_ms: elapsed,
        };
      }

      if (Array.isArray(json.data)) {
        allAds.push(...json.data);
      }

      nextUrl = json.paging?.next ?? null;
      pages++;
    }

    const elapsed = Date.now() - t0;
    await logApiCall({
      search_page_ids: pageId,
      ad_active_status: "ALL",
      ad_reached_countries: JSON.stringify(countries),
      ads_returned: allAds.length,
      pages_fetched: pages,
      response_time_ms: elapsed,
      http_status: lastHttpStatus,
      caller_handler: context?.caller_handler,
      offer_id: context?.offer_id,
    });

    return {
      ads: allAds,
      pages_fetched: pages,
      blocked: false,
      response_time_ms: elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    await logApiCall({
      search_page_ids: pageId,
      ad_active_status: "ALL",
      ad_reached_countries: JSON.stringify(countries),
      pages_fetched: pages,
      response_time_ms: elapsed,
      http_status: lastHttpStatus,
      error_message: msg,
      caller_handler: context?.caller_handler,
      offer_id: context?.offer_id,
    });
    return {
      ads: allAds,
      pages_fetched: pages,
      blocked: true,
      error: msg,
      response_time_ms: elapsed,
    };
  }
}

/**
 * Dado um array de ads (ativos + inativos com start/stop times), reconstrói
 * a série temporal "quantos ads estavam ativos no dia D" pros últimos N dias.
 *
 * Retorna Map<YYYY-MM-DD, count>.
 *
 * Regra: ad está ativo no dia D se
 *   start_time <= D AND (stop_time IS NULL OR stop_time >= D)
 */
export function reconstructDailyTimeline(
  ads: HistoryAd[],
  daysBack: number = 30
): Map<string, number> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const result = new Map<string, number>();

  for (let i = 0; i < daysBack; i++) {
    const dayDate = new Date(now - i * dayMs);
    const dayKey = dayDate.toISOString().slice(0, 10); // YYYY-MM-DD
    const dayEnd = new Date(dayKey + "T23:59:59Z").getTime();
    const dayStart = new Date(dayKey + "T00:00:00Z").getTime();

    let count = 0;
    for (const ad of ads) {
      if (!ad.ad_delivery_start_time) continue;
      const start = new Date(ad.ad_delivery_start_time).getTime();
      const stop = ad.ad_delivery_stop_time
        ? new Date(ad.ad_delivery_stop_time).getTime()
        : Infinity;

      // Ad ativo no dia D se sua janela de entrega intersecta o dia
      if (start <= dayEnd && stop >= dayStart) {
        count++;
      }
    }
    result.set(dayKey, count);
  }

  return result;
}
