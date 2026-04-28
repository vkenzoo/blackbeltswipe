import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/worker/health
 *
 * Retorna status do(s) worker(s) + métricas de saúde:
 *   - running: bool (heartbeat nos últimos 2min)
 *   - last_beat_at, uptime_seconds
 *   - jobs_processed, jobs_errored (acumulado desde restart)
 *   - jobs_1h: { done, error, pending, running }
 *   - last_job_finished_at, last_job_started_at
 *   - browser_jobs_since_launch
 *   - concurrency, running_counts
 *
 * Admin-only.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const service = createServiceClient();
  const now = Date.now();
  const since1h = new Date(now - 60 * 60 * 1000).toISOString();

  // 1. Heartbeats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: heartbeats } = await (service as any)
    .from("worker_heartbeats")
    .select("*")
    .order("last_beat_at", { ascending: false })
    .returns<
      Array<{
        worker_id: string;
        last_beat_at: string;
        started_at: string;
        version: string | null;
        jobs_processed: number;
        jobs_errored: number;
        browser_jobs_since_launch: number | null;
        node_version: string | null;
        pid: number | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: any;
      }>
    >();

  // 2. Stats recentes de jobs
  const { data: recentJobs } = await service
    .from("jobs")
    .select("status, created_at, started_at, finished_at")
    .gte("created_at", since1h)
    .returns<
      Array<{
        status: "pending" | "running" | "done" | "error";
        created_at: string;
        started_at: string | null;
        finished_at: string | null;
      }>
    >();

  const stats1h = { done: 0, error: 0, pending: 0, running: 0 };
  let lastFinishedAt: string | null = null;
  let lastStartedAt: string | null = null;
  for (const j of recentJobs ?? []) {
    stats1h[j.status]++;
    if (j.finished_at && (!lastFinishedAt || j.finished_at > lastFinishedAt)) {
      lastFinishedAt = j.finished_at;
    }
    if (j.started_at && (!lastStartedAt || j.started_at > lastStartedAt)) {
      lastStartedAt = j.started_at;
    }
  }

  // 3. Health verdict
  const workers = (heartbeats ?? []).map((h) => {
    const ageMs = now - new Date(h.last_beat_at).getTime();
    const running = ageMs < 2 * 60 * 1000; // 2min
    const uptimeSec = Math.floor(
      (now - new Date(h.started_at).getTime()) / 1000
    );
    return {
      worker_id: h.worker_id,
      running,
      status: running ? "healthy" : ageMs < 10 * 60 * 1000 ? "stale" : "dead",
      last_beat_at: h.last_beat_at,
      last_beat_age_seconds: Math.floor(ageMs / 1000),
      started_at: h.started_at,
      uptime_seconds: uptimeSec,
      uptime_human: humanUptime(uptimeSec),
      version: h.version,
      pid: h.pid,
      node_version: h.node_version,
      jobs_processed: h.jobs_processed,
      jobs_errored: h.jobs_errored,
      browser_jobs_since_launch: h.browser_jobs_since_launch,
      running_counts: h.metadata?.running_counts ?? {},
      concurrency: h.metadata?.concurrency ?? {},
    };
  });

  const anyRunning = workers.some((w) => w.running);

  return NextResponse.json({
    status: anyRunning ? "healthy" : workers.length > 0 ? "stale" : "unknown",
    workers_count: workers.length,
    any_running: anyRunning,
    jobs_1h: stats1h,
    last_job_started_at: lastStartedAt,
    last_job_finished_at: lastFinishedAt,
    checked_at: new Date().toISOString(),
    workers,
  });
}

function humanUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}min`;
  const day = Math.floor(hr / 24);
  return `${day}d ${hr % 24}h`;
}
