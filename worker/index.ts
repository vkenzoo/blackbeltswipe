#!/usr/bin/env bun
/**
 * Worker process: polla Supabase jobs table e dispatcha handlers.
 * Roda separado do Next.js dev server pra não bloquear UI.
 *
 * Uso:
 *   bun --env-file=.env.local run worker/index.ts
 *
 * Em produção: Docker container no Coolify com mesma env vars.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { handleEnrichFromUrl, handleEnrichOffer } from "./handlers/enrich";
import { handleExtractVsl } from "./handlers/extract-vsl";
import { handleGenerateThumb } from "./handlers/generate-thumb";
import { handleScreenshotPage } from "./handlers/screenshot-page";
import { handleTranscribeVsl } from "./handlers/transcribe-vsl";
import { handleTranscribeCreative } from "./handlers/transcribe-creative";
import { handleRefreshAdCount } from "./handlers/refresh-ad-count";
import { handleComputeScaleScore } from "./handlers/compute-scale-score";
import { handleAiAuthoring } from "./handlers/ai-authoring";
import { handleBulkAdLibraryPrep } from "./handlers/bulk-ad-library-prep";
import { handleBackfillAdCount } from "./handlers/backfill-ad-count";
import { handleSyncCreatives } from "./handlers/sync-creatives";
import {
  screenshotPagesSweep,
  transcribeCreativesSweep,
  dailyRefreshSweep,
  computeScoresSweep,
  domainDiscoverySweep,
  killZombieJobsSweep,
} from "./sweeps";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SERVICE_KEY) {
  console.error("❌ Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

type Supa = SupabaseClient<Database>;

const supa: Supa = createClient<Database>(SUPA_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const POLL_INTERVAL_MS = 2000;

// Timeout por tipo de job (ms). Se passar, aborta e marca como error.
const JOB_TIMEOUT_MS: Record<string, number> = {
  screenshot_page: 90_000,     // 90s — páginas normais + FB/IG com limit
  generate_thumb: 60_000,      // 60s — download mp4 + ffmpeg
  transcribe_vsl: 900_000,     // 15min — Whisper lento em VSLs longas
  transcribe_creative: 300_000, // 5min — criativos são curtos (15-60s)
  extract_vsl: 1_800_000,      // 30min — HLS re-encode
  enrich_offer: 1_800_000,     // 30min
  enrich_from_url: 1_800_000,  // 30min
  refresh_ad_count: 120_000,   // 120s — multi-page + Layer 3 domain fallback podem ir além de 60s
  compute_scale_score: 15_000, // 15s — só DB reads + pure fn
  ai_authoring: 30_000,        // 30s — GPT-4o-mini vision
  bulk_ad_library_prep: 30_000, // 30s — só Meta API + insert
  backfill_ad_count: 120_000,  // 120s — pode paginar muitas ads antigas
  sync_creatives: 600_000,     // 10min — Playwright em até 30 ads (vídeos pesados)
};

// Concorrência por tipo (quantos desse tipo podem rodar em paralelo)
const CONCURRENCY: Record<string, number> = {
  screenshot_page: 5,          // 5 screenshots em paralelo (browser compartilhado)
  generate_thumb: 3,           // 3 thumbs (ffmpeg leve em frame único)
  transcribe_vsl: 1,           // Whisper API tem rate limit
  transcribe_creative: 2,      // criativos curtos — 2 em paralelo OK
  extract_vsl: 1,              // ffmpeg é CPU-bound pesado, 1 por vez
  enrich_offer: 1,
  enrich_from_url: 2,          // 2 landings em paralelo — landing real é leve no Playwright
  refresh_ad_count: 3,         // 3 ofertas em paralelo (evita rate limit FB)
  compute_scale_score: 5,      // só DB reads, pode ser parallel
  ai_authoring: 2,             // 2 calls concurrent pro OpenAI
  bulk_ad_library_prep: 5,     // só Meta API leve, alta concorrência
  backfill_ad_count: 2,        // 2 em paralelo — pesado, cuidado com rate limit
  sync_creatives: 1,           // 1 por vez — usa browser pesadamente em N ads
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JobRow = Database["public"]["Tables"]["jobs"]["Row"] & { payload: any };

const HANDLERS: Record<string, (supa: Supa, payload: JobRow["payload"]) => Promise<unknown>> = {
  enrich_from_url: handleEnrichFromUrl,
  enrich_offer: handleEnrichOffer,
  extract_vsl: handleExtractVsl,
  generate_thumb: handleGenerateThumb,
  screenshot_page: handleScreenshotPage,
  transcribe_vsl: handleTranscribeVsl,
  transcribe_creative: handleTranscribeCreative,
  refresh_ad_count: handleRefreshAdCount,
  compute_scale_score: handleComputeScaleScore,
  ai_authoring: handleAiAuthoring,
  bulk_ad_library_prep: handleBulkAdLibraryPrep,
  backfill_ad_count: handleBackfillAdCount,
  sync_creatives: handleSyncCreatives,
};

// Contadores de jobs rodando por kind (pra respeitar CONCURRENCY)
const runningCounts: Record<string, number> = {};

async function pickJobs(limit: number): Promise<JobRow[]> {
  // Pega até N pending jobs respeitando:
  //  - priority DESC (user-triggered > sweeps)
  //  - created_at ASC (FIFO dentro da mesma priority)
  //  - retry_at <= NOW (pula jobs em backoff)
  //  - CONCURRENCY por kind
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supa as any)
    .from("jobs")
    .select("*")
    .eq("status", "pending")
    .or(`retry_at.is.null,retry_at.lte.${nowIso}`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(15)
    .returns<JobRow[]>();

  if (error) {
    console.error("[worker] query pending jobs error:", error.message);
    return [];
  }

  const picked: JobRow[] = [];
  for (const job of data ?? []) {
    if (picked.length >= limit) break;
    const running = runningCounts[job.kind] ?? 0;
    const maxConcurrency = CONCURRENCY[job.kind] ?? 1;
    if (running >= maxConcurrency) continue;

    // Claim atômico — mesma priority check pra evitar race
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr, data: updated } = await (supa.from("jobs") as any)
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .single();
    if (updErr || !updated) continue; // outro worker pegou
    runningCounts[job.kind] = running + 1;
    picked.push(job);
  }
  return picked;
}

async function markDone(jobId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa.from("jobs") as any)
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("id", jobId);
  jobsProcessedCount++;
}

/**
 * Retry com exponential backoff.
 * Tentativa 1 (falha) → retry_at = now + 30s
 * Tentativa 2 (falha) → retry_at = now + 2min
 * Tentativa 3 (falha) → retry_at = now + 10min
 * Tentativa 4+ (falha) → status = error permanente
 */
function retryDelayMs(attempts: number): number {
  const LADDER = [30_000, 120_000, 600_000]; // 30s, 2min, 10min
  return LADDER[Math.min(attempts, LADDER.length - 1)];
}

async function markError(
  jobId: string,
  err: string,
  attempts: number,
  maxAttempts: number,
  kind: string
) {
  const newAttempts = attempts + 1;
  const shouldRetry = newAttempts < maxAttempts;

  if (shouldRetry) {
    const delay = retryDelayMs(attempts);
    const retryAt = new Date(Date.now() + delay).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("jobs") as any)
      .update({
        status: "pending", // volta pra pending pro próximo pickJobs
        error: err.slice(0, 2000),
        finished_at: null, // limpa pra não confundir duration
        started_at: null,
        attempts: newAttempts,
        retry_at: retryAt,
      })
      .eq("id", jobId);
    console.log(
      `[worker] ↻ ${kind} (${jobId.slice(0, 8)}) · retry ${newAttempts}/${maxAttempts} em ${Math.round(delay / 1000)}s`
    );
  } else {
    // Esgotou retries — marca como erro permanente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("jobs") as any)
      .update({
        status: "error",
        error: err.slice(0, 2000),
        finished_at: new Date().toISOString(),
        attempts: newAttempts,
      })
      .eq("id", jobId);
    console.log(
      `[worker] ✖ ${kind} (${jobId.slice(0, 8)}) · erro permanente (${newAttempts} tentativas)`
    );
    jobsErroredCount++;
  }
}

async function processJob(job: JobRow) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxAttempts = (job as any).max_attempts ?? 3;
  const handler = HANDLERS[job.kind];
  if (!handler) {
    await markError(job.id, `unknown_kind: ${job.kind}`, job.attempts, maxAttempts, job.kind);
    runningCounts[job.kind] = Math.max(0, (runningCounts[job.kind] ?? 1) - 1);
    return;
  }

  const timeoutMs = JOB_TIMEOUT_MS[job.kind] ?? 300_000;
  console.log(`[worker] ▶ ${job.kind} (${job.id.slice(0, 8)}) · timeout=${timeoutMs / 1000}s`);
  const t0 = Date.now();

  try {
    // Timeout por job — se passar do limite, aborta e marca como error.
    await Promise.race([
      handler(supa, job.payload),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`job_timeout_${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    await markDone(job.id);
    console.log(`[worker] ✅ ${job.kind} (${job.id.slice(0, 8)}) · ${elapsed}s`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.error(`[worker] ❌ ${job.kind} (${job.id.slice(0, 8)}) · ${elapsed}s:`, msg);
    await markError(job.id, msg, job.attempts, maxAttempts, job.kind);
  } finally {
    runningCounts[job.kind] = Math.max(0, (runningCounts[job.kind] ?? 1) - 1);
  }
}

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;    // 24h pra sweeps "heavy"
const REFRESH_TICK_MS = 60 * 60 * 1000;           // 1h tick pro daily refresh (respeita tiered freq)
const DOMAIN_DISCOVERY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const ZOMBIE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;   // 5min — leve, roda frequente
let lastSweepAt = 0;
let lastRefreshTickAt = 0;
let lastDomainDiscoveryAt = 0;
let lastZombieSweepAt = 0;

async function runHeavySweeps() {
  try {
    const res = await screenshotPagesSweep(supa);
    console.log(
      `[sweep:screenshots] total_missing=${res.totalMissing} enqueued=${res.enqueued} skipped=${res.skipped}`
    );
  } catch (err) {
    console.error("[sweep:screenshots] erro:", err);
  }
  try {
    const res = await transcribeCreativesSweep(supa);
    console.log(
      `[sweep:transcribe] total_missing=${res.totalMissing} enqueued=${res.enqueued} skipped=${res.skipped}`
    );
  } catch (err) {
    console.error("[sweep:transcribe] erro:", err);
  }
  try {
    const res = await computeScoresSweep(supa);
    console.log(
      `[sweep:scores] total=${res.total} enqueued=${res.enqueued}`
    );
  } catch (err) {
    console.error("[sweep:scores] erro:", err);
  }
  lastSweepAt = Date.now();
}

async function runRefreshTick() {
  try {
    const res = await dailyRefreshSweep(supa);
    if (res.enqueued > 0) {
      console.log(
        `[sweep:refresh] eligible=${res.eligible} enqueued=${res.enqueued} skipped=${res.skipped}`
      );
    }
  } catch (err) {
    console.error("[sweep:refresh] erro:", err);
  }
  lastRefreshTickAt = Date.now();
}

async function runZombieSweep() {
  try {
    const res = await killZombieJobsSweep(supa);
    if (res.killed > 0) {
      console.log(
        `[sweep:zombies] 🧟 killed=${res.killed} (${res.details
          .map((d) => `${d.kind}:${d.elapsed_min}min`)
          .join(", ")})`
      );
    }
  } catch (err) {
    console.error("[sweep:zombies] erro:", err);
  }
  lastZombieSweepAt = Date.now();
}

async function runDomainDiscovery() {
  try {
    console.log(
      `[sweep:domain_discovery] iniciando — escaneando ofertas com main_site...`
    );
    const res = await domainDiscoverySweep(supa);
    console.log(
      `[sweep:domain_discovery] scanned=${res.scanned} new_pages=${res.new_pages} skipped=${res.skipped}`
    );
  } catch (err) {
    console.error("[sweep:domain_discovery] erro:", err);
  }
  lastDomainDiscoveryAt = Date.now();
}

// ─────────────────────────────────────────────────────────────
// Heartbeat — worker escreve pulso cada 30s pro /api/worker/health ler
// ─────────────────────────────────────────────────────────────

const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}`;
const HEARTBEAT_INTERVAL_MS = 30_000;
let lastHeartbeatAt = 0;
let jobsProcessedCount = 0;
let jobsErroredCount = 0;
const WORKER_STARTED_AT = new Date().toISOString();

async function writeHeartbeat() {
  try {
    // Pega stats do browser se carregado
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let browserJobs: number | null = null;
    try {
      const mod = await import("./shared-browser");
      browserJobs = mod.getBrowserStats().jobs_since_launch;
    } catch {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("worker_heartbeats") as any).upsert(
      {
        worker_id: WORKER_ID,
        last_beat_at: new Date().toISOString(),
        started_at: WORKER_STARTED_AT,
        version: "1.0.0",
        jobs_processed: jobsProcessedCount,
        jobs_errored: jobsErroredCount,
        browser_jobs_since_launch: browserJobs,
        node_version: process.version,
        pid: process.pid,
        metadata: {
          running_counts: runningCounts,
          concurrency: CONCURRENCY,
        },
      },
      { onConflict: "worker_id" }
    );
    lastHeartbeatAt = Date.now();
  } catch (err) {
    console.warn("[worker] heartbeat error:", err);
  }
}

async function loop() {
  console.log(
    `[worker] 🔄 rodando · poll=${POLL_INTERVAL_MS}ms · concurrency=${JSON.stringify(CONCURRENCY)}`
  );

  // Sweeps iniciais: heavy (screenshots/transcribe/scores) + refresh tick + heartbeat
  await writeHeartbeat();
  await runZombieSweep(); // IMPORTANTE: roda ANTES dos outros pra limpar jobs
                           // órfãos de worker restart anterior. Sem isso, fila
                           // pode estar bloqueada por zumbis quando worker sobe.
  await runHeavySweeps();
  await runRefreshTick();

  while (true) {
    // Heartbeat periódico (30s)
    if (Date.now() - lastHeartbeatAt > HEARTBEAT_INTERVAL_MS) {
      await writeHeartbeat();
    }
    // Zombie sweep (a cada 5min) — desbloqueia fila se worker anterior morreu
    if (Date.now() - lastZombieSweepAt > ZOMBIE_SWEEP_INTERVAL_MS) {
      await runZombieSweep();
    }
    // Sweep heavy periódico (a cada 24h)
    if (Date.now() - lastSweepAt > SWEEP_INTERVAL_MS) {
      await runHeavySweeps();
    }
    // Refresh tick (a cada 1h) — enfileira refresh_ad_count pra ofertas eligible
    if (Date.now() - lastRefreshTickAt > REFRESH_TICK_MS) {
      await runRefreshTick();
    }
    // Domain discovery — DESABILITADO por padrão. Gerava contaminação de
    // criativos (page_ids errados entrando e alimentando sync-creatives).
    // Pra reativar, setar DOMAIN_DISCOVERY_ENABLED=true E depois que admin
    // aprovar as pages descobertas manualmente via /admin/offers/[id]/edit.
    if (
      process.env.DOMAIN_DISCOVERY_ENABLED === "true" &&
      Date.now() - lastDomainDiscoveryAt > DOMAIN_DISCOVERY_INTERVAL_MS
    ) {
      await runDomainDiscovery();
    }

    try {
      // Max 8 jobs concorrentes no total (screenshot 5 + thumb 3 + heavy 1 esperando)
      const totalRunning = Object.values(runningCounts).reduce((a, b) => a + b, 0);
      const slots = Math.max(0, 8 - totalRunning);
      const jobs = await pickJobs(slots);
      if (jobs.length > 0) {
        // Fire and forget — cada job roda em paralelo, worker continua pollando
        jobs.forEach((job) => {
          processJob(job).catch((err) => {
            console.error(`[worker] processJob fatal:`, err);
          });
        });
      }
    } catch (err) {
      console.error("[worker] loop error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[worker] SIGINT — saindo");
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("\n[worker] SIGTERM — saindo");
  process.exit(0);
});

loop().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
