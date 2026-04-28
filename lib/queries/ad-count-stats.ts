/**
 * Queries pra página /admin/contagem-ads.
 *
 * Usa `offer_metrics` (time_window='snapshot_1d') que já é populado pelo
 * handler `refresh_ad_count` a cada refresh. Aqui a gente agrega:
 *   - ad_count atual (da tabela offers)
 *   - ad_count 7d atrás (snapshot mais antigo dentro dos últimos 7 dias)
 *   - ad_count 30d atrás
 *   - pico histórico (max de todos snapshots)
 *   - timeline 30d pra sparkline
 *
 * Overview agrega números pro header: total offers active, total ads somados,
 * ofertas stale (sem refresh em >48h), ofertas zeradas.
 */

import { createServiceClient } from "@/lib/supabase/server";

export type AdCountRow = {
  offer_id: string;
  slug: string;
  title: string;
  status: string;
  niche: string | null;
  language: string | null;
  ad_count_now: number;
  ad_count_7d: number | null;
  ad_count_30d: number | null;
  ad_count_peak: number;
  delta_7d: number | null; // ad_count_now - ad_count_7d
  delta_7d_pct: number | null; // % change
  last_refreshed_at: string | null;
  refresh_interval_hours: number;
  hours_since_refresh: number | null;
  is_stale: boolean; // >48h sem refresh
  sparkline: number[]; // últimos 30 pontos
};

export type AdCountOverview = {
  total_active: number;
  total_ads_now: number;
  total_ads_peak: number; // soma dos picos históricos
  count_zero: number; // ofertas com 0 ads
  count_growing: number; // ad_count_now > ad_count_7d
  count_declining: number;
  count_stale: number; // >48h sem refresh
  last_cron_run_at: string | null; // último refresh_ad_count concluído
  success_rate_24h: number; // 0-1
};

type SnapshotRow = {
  offer_id: string;
  ad_count: number;
  sampled_at: string;
};

type OfferRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  niche: string | null;
  language: string | null;
  ad_count: number | null;
  last_refreshed_at: string | null;
  refresh_interval_hours: number | null;
};

const STALE_THRESHOLD_HOURS = 48;

export async function getAdCountOverview(): Promise<AdCountOverview> {
  const supa = createServiceClient();
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  type OverviewOfferRow = {
    id: string;
    ad_count: number | null;
    last_refreshed_at: string | null;
    status: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offersData } = await (supa as any)
    .from("offers")
    .select("id, ad_count, last_refreshed_at, status")
    .in("status", ["active", "paused"]);
  const offers: OverviewOfferRow[] = offersData ?? [];

  const activeOffers = offers.filter((o: OverviewOfferRow) => o.status === "active");

  // Snapshots dos últimos 30d pra calcular delta 7d e pico histórico
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snapshotsData } = await (supa as any)
    .from("offer_metrics")
    .select("offer_id, ad_count, sampled_at")
    .eq("time_window", "snapshot_1d")
    .gte("sampled_at", thirtyDaysAgo);
  const snapshots: SnapshotRow[] = snapshotsData ?? [];

  const snapsByOffer = new Map<string, SnapshotRow[]>();
  for (const s of snapshots) {
    if (!snapsByOffer.has(s.offer_id)) snapsByOffer.set(s.offer_id, []);
    snapsByOffer.get(s.offer_id)!.push(s);
  }

  let totalAdsNow = 0;
  let totalAdsPeak = 0;
  let countZero = 0;
  let countGrowing = 0;
  let countDeclining = 0;
  let countStale = 0;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  for (const offer of activeOffers) {
    const current = offer.ad_count ?? 0;
    totalAdsNow += current;

    if (current === 0) countZero++;

    const snaps = snapsByOffer.get(offer.id) ?? [];
    const peak = Math.max(current, ...snaps.map((s) => s.ad_count));
    totalAdsPeak += peak;

    // 7d ago — snapshot mais antigo que é >= 7d atrás
    const past7dSnaps = snaps
      .filter((s) => new Date(s.sampled_at).getTime() <= sevenDaysAgo)
      .sort(
        (a, b) =>
          new Date(b.sampled_at).getTime() - new Date(a.sampled_at).getTime()
      );
    if (past7dSnaps.length > 0) {
      const past = past7dSnaps[0].ad_count;
      if (current > past) countGrowing++;
      else if (current < past) countDeclining++;
    }

    // Stale?
    if (!offer.last_refreshed_at) {
      countStale++;
    } else {
      const hoursSince =
        (now - new Date(offer.last_refreshed_at).getTime()) / 3600000;
      if (hoursSince > STALE_THRESHOLD_HOURS) countStale++;
    }
  }

  // Última rodada de cron: último job refresh_ad_count com status=done
  // (schema usa `finished_at` + status='done'|'error', não completed_at)
  type JobRow = { finished_at: string | null; status: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastJobsData } = await (supa as any)
    .from("jobs")
    .select("finished_at, status")
    .eq("kind", "refresh_ad_count")
    .in("status", ["done", "error"])
    .order("finished_at", { ascending: false })
    .limit(50);

  const recentJobs: JobRow[] = lastJobsData ?? [];
  const lastCronRunAt = recentJobs[0]?.finished_at ?? null;
  const doneCount = recentJobs.filter((j: JobRow) => j.status === "done").length;
  const successRate24h =
    recentJobs.length === 0 ? 1 : doneCount / recentJobs.length;

  return {
    total_active: activeOffers.length,
    total_ads_now: totalAdsNow,
    total_ads_peak: totalAdsPeak,
    count_zero: countZero,
    count_growing: countGrowing,
    count_declining: countDeclining,
    count_stale: countStale,
    last_cron_run_at: lastCronRunAt,
    success_rate_24h: successRate24h,
  };
}

export async function getAdCountTable(opts?: {
  filter?: "all" | "stale" | "zero" | "growing" | "declining";
  statusFilter?: "active" | "paused" | "all";
}): Promise<AdCountRow[]> {
  const supa = createServiceClient();
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const statusList =
    opts?.statusFilter === "paused"
      ? ["paused"]
      : opts?.statusFilter === "all"
        ? ["active", "paused", "archived"]
        : ["active"];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offersData } = await (supa as any)
    .from("offers")
    .select(
      "id, slug, title, status, niche, language, ad_count, last_refreshed_at, refresh_interval_hours"
    )
    .in("status", statusList)
    .order("ad_count", { ascending: false, nullsFirst: false });

  const offers: OfferRow[] = offersData ?? [];
  if (offers.length === 0) return [];

  const offerIds = offers.map((o: OfferRow) => o.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snapshotsData } = await (supa as any)
    .from("offer_metrics")
    .select("offer_id, ad_count, sampled_at")
    .eq("time_window", "snapshot_1d")
    .in("offer_id", offerIds)
    .gte("sampled_at", thirtyDaysAgo)
    .order("sampled_at", { ascending: true });

  const snapshots: SnapshotRow[] = snapshotsData ?? [];

  const snapsByOffer = new Map<string, SnapshotRow[]>();
  for (const s of snapshots) {
    if (!snapsByOffer.has(s.offer_id)) snapsByOffer.set(s.offer_id, []);
    snapsByOffer.get(s.offer_id)!.push(s);
  }

  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgoMs = now - 30 * 24 * 60 * 60 * 1000;

  const rows: AdCountRow[] = offers.map((o: OfferRow): AdCountRow => {
    const snaps = (snapsByOffer.get(o.id) ?? []).slice().sort(
      (a, b) =>
        new Date(a.sampled_at).getTime() - new Date(b.sampled_at).getTime()
    );
    const current = o.ad_count ?? 0;
    const peak = Math.max(current, ...snaps.map((s) => s.ad_count), 0);

    // 7d ago — snapshot MAIS RECENTE com sampled_at <= 7d ago
    const past7d = snaps
      .filter((s) => new Date(s.sampled_at).getTime() <= sevenDaysAgo)
      .sort(
        (a, b) =>
          new Date(b.sampled_at).getTime() - new Date(a.sampled_at).getTime()
      )[0];
    const ad_count_7d = past7d?.ad_count ?? null;
    const delta_7d = ad_count_7d !== null ? current - ad_count_7d : null;
    const delta_7d_pct =
      ad_count_7d !== null && ad_count_7d !== 0
        ? (current - ad_count_7d) / ad_count_7d
        : ad_count_7d === 0 && current > 0
          ? null
          : null;

    // 30d ago — snapshot mais antigo
    const past30d = snaps[0];
    const ad_count_30d =
      past30d && new Date(past30d.sampled_at).getTime() <= thirtyDaysAgoMs + 24 * 60 * 60 * 1000
        ? past30d.ad_count
        : null;

    // Sparkline: pega 1 valor por dia pros últimos 30 dias (pega o mais recente de cada dia)
    const byDay = new Map<string, number>();
    for (const s of snaps) {
      const day = s.sampled_at.slice(0, 10);
      byDay.set(day, s.ad_count); // overwrite — fica com o último do dia
    }
    const sparkline: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now - i * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      if (byDay.has(day)) sparkline.push(byDay.get(day)!);
    }
    // Adiciona valor atual no fim da sparkline
    sparkline.push(current);

    const hoursSince = o.last_refreshed_at
      ? (now - new Date(o.last_refreshed_at).getTime()) / 3600000
      : null;

    const isStale =
      hoursSince === null || hoursSince > STALE_THRESHOLD_HOURS;

    return {
      offer_id: o.id,
      slug: o.slug,
      title: o.title,
      status: o.status,
      niche: o.niche,
      language: o.language,
      ad_count_now: current,
      ad_count_7d,
      ad_count_30d,
      ad_count_peak: peak,
      delta_7d,
      delta_7d_pct,
      last_refreshed_at: o.last_refreshed_at,
      refresh_interval_hours: o.refresh_interval_hours ?? 24,
      hours_since_refresh: hoursSince,
      is_stale: isStale,
      sparkline,
    };
  });

  // Filtros
  const filter = opts?.filter ?? "all";
  if (filter === "stale") return rows.filter((r) => r.is_stale);
  if (filter === "zero") return rows.filter((r) => r.ad_count_now === 0);
  if (filter === "growing")
    return rows.filter((r) => r.delta_7d !== null && r.delta_7d > 0);
  if (filter === "declining")
    return rows.filter((r) => r.delta_7d !== null && r.delta_7d < 0);

  return rows;
}
