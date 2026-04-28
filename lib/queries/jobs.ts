import { createClient } from "@/lib/supabase/server";
import { estimateJobCost, type CostHints } from "@/lib/worker/cost-calculator";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type DateRange = "24h" | "7d" | "30d" | "90d";

export const RANGE_LABELS: Record<DateRange, string> = {
  "24h": "24 horas",
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
};

export type JobRow = {
  id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  status: "pending" | "running" | "done" | "error";
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
};

export type JobWithCost = JobRow & {
  duration_seconds: number | null;
  cost_usd: number;
  cost_explanation: string;
  cost_estimated: boolean;
  offer_slug: string | null;
};

export type WorkerStats = {
  range: DateRange;
  total: number;
  byStatus: { pending: number; running: number; done: number; error: number };
  byKind: Array<{
    kind: string;
    total: number;
    ok: number;
    err: number;
    running: number;
    pending: number;
    avg_duration_seconds: number | null;
    total_cost_usd: number;
  }>;
  totalCost: number;
  successRate: number;
  /** Buckets de tempo pra line chart. Cada bucket tem { timestamp, total, cost_usd, byKind } */
  timeSeries: TimeSeriesBucket[];
  /** Pie chart data — custo por kind (já filtered pros que têm cost > 0) */
  costBreakdown: Array<{ kind: string; cost_usd: number; jobs: number }>;
};

export type TimeSeriesBucket = {
  /** ISO timestamp do início do bucket */
  timestamp: string;
  /** Label pra eixo X (ex: "14h", "19/04") */
  label: string;
  /** Total de jobs nesse bucket */
  total: number;
  /** Custo total USD */
  cost_usd: number;
  /** Breakdown por kind (keys = kind, values = count) */
  byKind: Record<string, number>;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function rangeToMs(range: DateRange): number {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  switch (range) {
    case "24h": return 24 * HOUR;
    case "7d":  return 7 * DAY;
    case "30d": return 30 * DAY;
    case "90d": return 90 * DAY;
  }
}

/** Tamanho do bucket pro time series, depende do range (24h → hourly, rest → daily) */
function bucketSizeMs(range: DateRange): number {
  return range === "24h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

/** Arredonda um Date pro início do bucket (hour ou day) */
function bucketKey(date: Date, range: DateRange): string {
  if (range === "24h") {
    // Hora cheia: YYYY-MM-DDTHH:00:00
    const d = new Date(date);
    d.setMinutes(0, 0, 0);
    return d.toISOString();
  }
  // Dia: YYYY-MM-DD
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Label curto pro eixo X */
function formatBucketLabel(iso: string, range: DateRange): string {
  const d = new Date(iso);
  if (range === "24h") {
    return `${String(d.getHours()).padStart(2, "0")}h`;
  }
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Gera todos os buckets vazios pro intervalo (pra não ter gaps no gráfico) */
function emptyBuckets(range: DateRange): TimeSeriesBucket[] {
  const size = bucketSizeMs(range);
  const total = Math.ceil(rangeToMs(range) / size);
  const now = Date.now();
  const nowAligned =
    range === "24h"
      ? now - (now % (60 * 60 * 1000))
      : new Date().setUTCHours(0, 0, 0, 0);

  const out: TimeSeriesBucket[] = [];
  for (let i = total - 1; i >= 0; i--) {
    const ts = new Date(nowAligned - i * size).toISOString();
    out.push({
      timestamp: ts,
      label: formatBucketLabel(ts, range),
      total: 0,
      cost_usd: 0,
      byKind: {},
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────

/**
 * Lista últimos N jobs (com cost estimado) — filtrados por range.
 */
export async function listRecentJobs(
  range: DateRange = "24h",
  limit = 100
): Promise<JobWithCost[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - rangeToMs(range)).toISOString();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<JobRow[]>();

  if (error || !jobs) {
    console.error("listRecentJobs error:", error);
    return [];
  }

  // Coleta ids pra batch fetch de durations/slug
  const offerIds = new Set<string>();
  const creativeIds = new Set<string>();
  for (const j of jobs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = j.payload as any;
    if (payload?.offer_id) offerIds.add(payload.offer_id);
    if (payload?.creative_id) creativeIds.add(payload.creative_id);
  }

  const offerMap = new Map<string, { slug: string; vsl_duration_seconds: number | null }>();
  if (offerIds.size > 0) {
    const { data } = await supabase
      .from("offers")
      .select("id, slug, vsl_duration_seconds")
      .in("id", [...offerIds])
      .returns<{ id: string; slug: string; vsl_duration_seconds: number | null }[]>();
    for (const o of data ?? []) {
      offerMap.set(o.id, { slug: o.slug, vsl_duration_seconds: o.vsl_duration_seconds });
    }
  }

  const creativeMap = new Map<string, { offer_id: string; duration_seconds: number | null }>();
  if (creativeIds.size > 0) {
    const { data } = await supabase
      .from("creatives")
      .select("id, offer_id, duration_seconds")
      .in("id", [...creativeIds])
      .returns<{ id: string; offer_id: string; duration_seconds: number | null }[]>();
    for (const c of data ?? []) {
      creativeMap.set(c.id, { offer_id: c.offer_id, duration_seconds: c.duration_seconds });
      if (!offerMap.has(c.offer_id)) offerIds.add(c.offer_id);
    }
  }
  if (offerIds.size > offerMap.size) {
    const missing = [...offerIds].filter((id) => !offerMap.has(id));
    if (missing.length > 0) {
      const { data } = await supabase
        .from("offers")
        .select("id, slug, vsl_duration_seconds")
        .in("id", missing)
        .returns<{ id: string; slug: string; vsl_duration_seconds: number | null }[]>();
      for (const o of data ?? []) {
        offerMap.set(o.id, { slug: o.slug, vsl_duration_seconds: o.vsl_duration_seconds });
      }
    }
  }

  return jobs.map((j) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = j.payload as any;
    const offerId: string | undefined = payload?.offer_id;
    const creativeId: string | undefined = payload?.creative_id;

    let durationForCost: number | null = null;
    if (j.kind === "transcribe_vsl" && offerId) {
      durationForCost = offerMap.get(offerId)?.vsl_duration_seconds ?? null;
    } else if (j.kind === "transcribe_creative" && creativeId) {
      durationForCost = creativeMap.get(creativeId)?.duration_seconds ?? null;
    }

    let wall: number | null = null;
    if (j.started_at && j.finished_at) {
      wall = (new Date(j.finished_at).getTime() - new Date(j.started_at).getTime()) / 1000;
    }

    let slug: string | null = null;
    if (offerId) slug = offerMap.get(offerId)?.slug ?? null;
    else if (creativeId) {
      const c = creativeMap.get(creativeId);
      if (c) slug = offerMap.get(c.offer_id)?.slug ?? null;
    }

    const hints: CostHints = { duration_seconds: durationForCost };
    const est = estimateJobCost(j.kind, hints);

    return {
      ...j,
      duration_seconds: wall,
      cost_usd: est.usd,
      cost_explanation: est.explanation,
      cost_estimated: est.estimated,
      offer_slug: slug,
    };
  });
}

/**
 * Stats agregados + time series + cost breakdown pro período.
 */
export async function getWorkerStats(range: DateRange = "30d"): Promise<WorkerStats> {
  const supabase = await createClient();
  const since = new Date(Date.now() - rangeToMs(range)).toISOString();

  // Pagina explicitamente — PostgREST tem default limit de 1000 rows.
  // Em 30d pode ter >1000 jobs facilmente (1714 confirmado em teste).
  // Sem paginação, gráfico perdia os dias recentes (Supabase ordena por id
  // physical = mais antigos primeiro quando não há ORDER BY).
  type JobStatRow = {
    id: string;
    kind: string;
    status: "pending" | "running" | "done" | "error";
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any;
  };
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 20; // safety cap em 20k jobs por range
  const jobs: JobStatRow[] = [];
  let queryError: { message: string } | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data: chunk, error: chunkErr } = await supabase
      .from("jobs")
      .select("id, kind, status, created_at, started_at, finished_at, payload")
      .gte("created_at", since)
      .order("created_at", { ascending: false }) // deterministic paging
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .returns<JobStatRow[]>();

    if (chunkErr) {
      queryError = chunkErr;
      break;
    }
    if (!chunk || chunk.length === 0) break;
    jobs.push(...chunk);
    if (chunk.length < PAGE_SIZE) break; // última página
  }

  if (queryError) {
    console.error("getWorkerStats error:", queryError);
    return {
      range,
      total: 0,
      byStatus: { pending: 0, running: 0, done: 0, error: 0 },
      byKind: [],
      totalCost: 0,
      successRate: 0,
      timeSeries: emptyBuckets(range),
      costBreakdown: [],
    };
  }

  // Batch fetch durations
  const offerIds = new Set<string>();
  const creativeIds = new Set<string>();
  for (const j of jobs) {
    if (j.payload?.offer_id) offerIds.add(j.payload.offer_id);
    if (j.payload?.creative_id) creativeIds.add(j.payload.creative_id);
  }

  const offerDurations = new Map<string, number | null>();
  if (offerIds.size > 0) {
    const { data } = await supabase
      .from("offers")
      .select("id, vsl_duration_seconds")
      .in("id", [...offerIds])
      .returns<{ id: string; vsl_duration_seconds: number | null }[]>();
    for (const o of data ?? []) offerDurations.set(o.id, o.vsl_duration_seconds);
  }

  const creativeDurations = new Map<string, number | null>();
  if (creativeIds.size > 0) {
    const { data } = await supabase
      .from("creatives")
      .select("id, duration_seconds")
      .in("id", [...creativeIds])
      .returns<{ id: string; duration_seconds: number | null }[]>();
    for (const c of data ?? []) creativeDurations.set(c.id, c.duration_seconds);
  }

  // Agrega
  const byStatus = { pending: 0, running: 0, done: 0, error: 0 };
  const kindMap = new Map<
    string,
    {
      kind: string;
      total: number;
      ok: number;
      err: number;
      running: number;
      pending: number;
      durations: number[];
      costTotal: number;
    }
  >();
  let totalCost = 0;
  let ok = 0;
  let err = 0;

  // Time series buckets
  const buckets = emptyBuckets(range);
  const bucketIndex = new Map<string, TimeSeriesBucket>();
  for (const b of buckets) bucketIndex.set(b.timestamp, b);

  for (const j of jobs) {
    byStatus[j.status]++;

    let bucket = kindMap.get(j.kind);
    if (!bucket) {
      bucket = {
        kind: j.kind,
        total: 0,
        ok: 0,
        err: 0,
        running: 0,
        pending: 0,
        durations: [],
        costTotal: 0,
      };
      kindMap.set(j.kind, bucket);
    }
    bucket.total++;
    if (j.status === "done") {
      bucket.ok++;
      ok++;
    } else if (j.status === "error") {
      bucket.err++;
      err++;
    } else if (j.status === "running") bucket.running++;
    else if (j.status === "pending") bucket.pending++;

    if (j.started_at && j.finished_at) {
      const wall = (new Date(j.finished_at).getTime() - new Date(j.started_at).getTime()) / 1000;
      if (wall >= 0) bucket.durations.push(wall);
    }

    let durationForCost: number | null = null;
    if (j.kind === "transcribe_vsl" && j.payload?.offer_id) {
      durationForCost = offerDurations.get(j.payload.offer_id) ?? null;
    } else if (j.kind === "transcribe_creative" && j.payload?.creative_id) {
      durationForCost = creativeDurations.get(j.payload.creative_id) ?? null;
    }
    const est = estimateJobCost(j.kind, { duration_seconds: durationForCost });
    bucket.costTotal += est.usd;
    totalCost += est.usd;

    // Distribui no time series bucket
    const key = bucketKey(new Date(j.created_at), range);
    const tsBucket = bucketIndex.get(key);
    if (tsBucket) {
      tsBucket.total++;
      tsBucket.cost_usd += est.usd;
      tsBucket.byKind[j.kind] = (tsBucket.byKind[j.kind] ?? 0) + 1;
    }
  }

  const byKind = [...kindMap.values()]
    .map((b) => ({
      kind: b.kind,
      total: b.total,
      ok: b.ok,
      err: b.err,
      running: b.running,
      pending: b.pending,
      avg_duration_seconds:
        b.durations.length > 0
          ? b.durations.reduce((a, c) => a + c, 0) / b.durations.length
          : null,
      total_cost_usd: b.costTotal,
    }))
    .sort((a, b) => b.total - a.total);

  const costBreakdown = byKind
    .filter((k) => k.total_cost_usd > 0)
    .map((k) => ({ kind: k.kind, cost_usd: k.total_cost_usd, jobs: k.total }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const totalOkErr = ok + err;
  const successRate = totalOkErr > 0 ? ok / totalOkErr : 1;

  return {
    range,
    total: jobs.length,
    byStatus,
    byKind,
    totalCost,
    successRate,
    timeSeries: buckets,
    costBreakdown,
  };
}
