import { createServiceClient } from "@/lib/supabase/server";

export type MetaApiCall = {
  id: string;
  search_page_ids: string | null;
  search_terms: string | null;
  ad_active_status: string | null;
  ad_reached_countries: string | null;
  ads_returned: number | null;
  pages_fetched: number | null;
  response_time_ms: number | null;
  http_status: number | null;
  error_code: number | null;
  error_subcode: number | null;
  error_message: string | null;
  caller_handler: string | null;
  offer_id: string | null;
  offer_slug?: string | null;
  created_at: string;
};

export type MetaApiStats = {
  total_calls: number;
  success_calls: number;
  error_calls: number;
  success_rate: number; // 0-1
  avg_response_ms: number;
  total_ads_returned: number;
  calls_by_hour: Array<{ hour: string; total: number; errors: number }>;
  calls_by_handler: Array<{ handler: string; total: number; avg_ms: number }>;
  top_errors: Array<{
    code: number | null;
    subcode: number | null;
    message: string;
    count: number;
  }>;
  // Rate limit tracking (Meta: ~200 calls/hour)
  calls_last_hour: number;
  rate_limit_warn: boolean;
};

export async function getMetaApiStats(
  hoursBack: number = 24
): Promise<MetaApiStats> {
  const supa = createServiceClient();
  const since = new Date(
    Date.now() - hoursBack * 60 * 60 * 1000
  ).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: calls } = await (supa as any)
    .from("meta_api_calls")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const rows: MetaApiCall[] = calls ?? [];

  if (rows.length === 0) {
    return {
      total_calls: 0,
      success_calls: 0,
      error_calls: 0,
      success_rate: 1,
      avg_response_ms: 0,
      total_ads_returned: 0,
      calls_by_hour: [],
      calls_by_handler: [],
      top_errors: [],
      calls_last_hour: 0,
      rate_limit_warn: false,
    };
  }

  const success = rows.filter((r) => !r.error_code && !r.error_message);
  const errors = rows.filter((r) => r.error_code || r.error_message);
  const totalMs = rows.reduce((s, r) => s + (r.response_time_ms ?? 0), 0);
  const totalAds = rows.reduce((s, r) => s + (r.ads_returned ?? 0), 0);

  // Last hour
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const lastHour = rows.filter(
    (r) => new Date(r.created_at).getTime() >= oneHourAgo
  ).length;

  // Por hora (histograma)
  const byHour = new Map<string, { total: number; errors: number }>();
  for (let i = 0; i < hoursBack; i++) {
    const ts = new Date(Date.now() - i * 60 * 60 * 1000);
    ts.setMinutes(0, 0, 0);
    byHour.set(ts.toISOString(), { total: 0, errors: 0 });
  }
  for (const r of rows) {
    const d = new Date(r.created_at);
    d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    const bucket = byHour.get(key);
    if (bucket) {
      bucket.total++;
      if (r.error_code || r.error_message) bucket.errors++;
    }
  }

  // Por handler
  const byHandler = new Map<string, { total: number; sum_ms: number }>();
  for (const r of rows) {
    const key = r.caller_handler ?? "desconhecido";
    const b = byHandler.get(key) ?? { total: 0, sum_ms: 0 };
    b.total++;
    b.sum_ms += r.response_time_ms ?? 0;
    byHandler.set(key, b);
  }

  // Top erros
  const errorsByKey = new Map<
    string,
    {
      code: number | null;
      subcode: number | null;
      message: string;
      count: number;
    }
  >();
  for (const r of errors) {
    const key = `${r.error_code ?? "?"}-${r.error_subcode ?? "?"}-${r.error_message?.slice(0, 50) ?? "?"}`;
    const existing = errorsByKey.get(key);
    if (existing) existing.count++;
    else {
      errorsByKey.set(key, {
        code: r.error_code,
        subcode: r.error_subcode,
        message: r.error_message ?? "(sem mensagem)",
        count: 1,
      });
    }
  }

  return {
    total_calls: rows.length,
    success_calls: success.length,
    error_calls: errors.length,
    success_rate: rows.length > 0 ? success.length / rows.length : 1,
    avg_response_ms: rows.length > 0 ? Math.round(totalMs / rows.length) : 0,
    total_ads_returned: totalAds,
    calls_by_hour: [...byHour.entries()]
      .map(([hour, v]) => ({ hour, ...v }))
      .sort((a, b) => a.hour.localeCompare(b.hour)),
    calls_by_handler: [...byHandler.entries()]
      .map(([handler, v]) => ({
        handler,
        total: v.total,
        avg_ms: Math.round(v.sum_ms / v.total),
      }))
      .sort((a, b) => b.total - a.total),
    top_errors: [...errorsByKey.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    calls_last_hour: lastHour,
    rate_limit_warn: lastHour > 180, // 90% do limite 200/h
  };
}

export async function getRecentMetaApiCalls(
  limit: number = 50
): Promise<MetaApiCall[]> {
  const supa = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: calls } = await (supa as any)
    .from("meta_api_calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows: MetaApiCall[] = calls ?? [];

  // Join com offers pra pegar slug
  const offerIds = [
    ...new Set(rows.map((r) => r.offer_id).filter(Boolean) as string[]),
  ];
  if (offerIds.length > 0) {
    const { data: offers } = await supa
      .from("offers")
      .select("id, slug")
      .in("id", offerIds)
      .returns<{ id: string; slug: string }[]>();
    const slugMap = new Map(offers?.map((o) => [o.id, o.slug]) ?? []);
    for (const r of rows) {
      if (r.offer_id) r.offer_slug = slugMap.get(r.offer_id) ?? null;
    }
  }

  return rows;
}
