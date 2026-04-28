/**
 * Sweeps — tarefas periódicas que o worker roda por conta própria.
 *
 * - screenshotPagesSweep: enfileira screenshot_page pra toda page.screenshot_url = NULL
 * - transcribeCreativesSweep: enfileira transcribe_creative pra todo video
 *   criativo sem transcript_text
 * - dailyRefreshSweep: enfileira refresh_ad_count pras ofertas cujo
 *   last_refreshed_at + refresh_interval_hours já passou (tiered frequency)
 * - computeScoresSweep: força recomputo do score pra todas ofertas active
 *   (útil pra trend/velocity atualizarem mesmo sem snapshot novo)
 * - domainDiscoverySweep: roda 1x/semana, busca ads por domínio (main_site)
 *   pra cada oferta e descobre Pages novas/simultâneas que não tavam
 *   cadastradas. Captura multi-Page advertisers (ex: Paulo Borges com 2 Pages).
 * - killZombieJobsSweep: mata jobs status='running' que ficaram órfãos
 *   (worker restart sem graceful shutdown). Previne fila bloqueada.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { discoverPagesForOffer } from "@/lib/worker/discover-pages-for-offer";
import { getBrowser } from "./shared-browser";

/**
 * Timeout por kind (ms) — precisa ser CONSISTENTE com JOB_TIMEOUT_MS em
 * worker/index.ts. Duplicado aqui pra evitar circular import (sweeps.ts é
 * importado por index.ts).
 *
 * Margem de segurança: sweep só mata job se passou 2× do timeout declarado
 * (dá tempo pro worker in-process terminar graceful antes de matar via DB).
 */
const ZOMBIE_TIMEOUT_MS: Record<string, number> = {
  screenshot_page: 90_000,
  generate_thumb: 60_000,
  transcribe_vsl: 900_000,
  transcribe_creative: 300_000,
  extract_vsl: 1_800_000,
  enrich_offer: 1_800_000,
  enrich_from_url: 1_800_000,
  refresh_ad_count: 60_000,
  compute_scale_score: 15_000,
  ai_authoring: 30_000,
  bulk_ad_library_prep: 30_000,
  backfill_ad_count: 120_000,
};

/**
 * Detecta e mata jobs "zumbis": status='running' com started_at > 2× timeout.
 *
 * Causa típica: worker foi restartado mid-job (pkill, crash, deploy) — o job
 * ficou marcado 'running' no DB pra sempre porque nenhum processo existe
 * mais pra concluir/abortar. Bloqueia concurrency slots (ex: extract_vsl
 * tem slot=1; 1 zumbi bloqueia toda a fila).
 *
 * Fator 2× dá margem pro worker atual terminar naturalmente antes de ser
 * marcado como zumbi. Marca com error='zombie_timeout:<kind>:<elapsed>s'
 * pra distinguir de erros reais.
 */
export async function killZombieJobsSweep(
  supa: SupabaseClient<Database>
): Promise<{ killed: number; details: Array<{ id: string; kind: string; elapsed_min: number }> }> {
  // Pega todos jobs running (com started_at)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: running, error } = await (supa as any)
    .from("jobs")
    .select("id, kind, started_at, attempts")
    .eq("status", "running")
    .not("started_at", "is", null);

  if (error) {
    console.error("[sweep:zombies] query error:", error.message);
    return { killed: 0, details: [] };
  }

  const now = Date.now();
  const zombies: Array<{
    id: string;
    kind: string;
    started_at: string;
    attempts: number;
  }> = [];

  for (const j of (running ?? []) as Array<{
    id: string;
    kind: string;
    started_at: string;
    attempts: number;
  }>) {
    const timeout = ZOMBIE_TIMEOUT_MS[j.kind] ?? 300_000;
    const elapsed = now - new Date(j.started_at).getTime();
    // 2× margem pro worker atual terminar graceful
    if (elapsed > timeout * 2) {
      zombies.push(j);
    }
  }

  if (zombies.length === 0) {
    return { killed: 0, details: [] };
  }

  const details: Array<{ id: string; kind: string; elapsed_min: number }> = [];

  for (const z of zombies) {
    const elapsed = now - new Date(z.started_at).getTime();
    const elapsedMin = Math.floor(elapsed / 60000);
    details.push({ id: z.id, kind: z.kind, elapsed_min: elapsedMin });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("jobs") as any)
      .update({
        status: "error",
        error: `zombie_timeout:${z.kind}:${elapsedMin}min`,
        finished_at: new Date().toISOString(),
      })
      .eq("id", z.id);
  }

  return { killed: zombies.length, details };
}

type Supa = SupabaseClient<Database>;

/**
 * Busca todas as pages sem screenshot e enfileira screenshot_page jobs
 * pra cada uma (evitando duplicata se já tem job pending/running pra ela).
 */
export async function screenshotPagesSweep(supa: Supa): Promise<{
  enqueued: number;
  skipped: number;
  totalMissing: number;
}> {
  // 1. Pega todas pages sem screenshot
  const { data: pages, error } = await supa
    .from("pages")
    .select("id")
    .is("screenshot_url", null)
    .returns<{ id: string }[]>();
  if (error) {
    console.error("[sweep:screenshots] query pages error:", error.message);
    return { enqueued: 0, skipped: 0, totalMissing: 0 };
  }
  const missing = pages ?? [];
  if (missing.length === 0) return { enqueued: 0, skipped: 0, totalMissing: 0 };

  // 2. Pega jobs screenshot_page pending/running já existentes (evita duplicata)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingJobs } = await supa
    .from("jobs")
    .select("payload, status")
    .eq("kind", "screenshot_page")
    .in("status", ["pending", "running"])
    .returns<Array<{ payload: any; status: string }>>();

  const alreadyEnqueued = new Set<string>();
  for (const j of existingJobs ?? []) {
    const pid = j.payload?.page_id;
    if (typeof pid === "string") alreadyEnqueued.add(pid);
  }

  // 3. Enfileira as que faltam
  const toEnqueue = missing.filter((p) => !alreadyEnqueued.has(p.id));
  let enqueued = 0;
  if (toEnqueue.length > 0) {
    const jobRows = toEnqueue.map((p) => ({
      kind: "screenshot_page",
      payload: { page_id: p.id },
      status: "pending",
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supa.from("jobs") as any).insert(jobRows);
    if (insErr) {
      console.error("[sweep:screenshots] insert jobs error:", insErr.message);
    } else {
      enqueued = toEnqueue.length;
    }
  }

  return {
    enqueued,
    skipped: missing.length - toEnqueue.length,
    totalMissing: missing.length,
  };
}

/**
 * Busca todos os video creatives sem transcript_text e enfileira
 * transcribe_creative jobs (dedupe por creative_id).
 */
export async function transcribeCreativesSweep(supa: Supa): Promise<{
  enqueued: number;
  skipped: number;
  totalMissing: number;
}> {
  const { data: creatives, error } = await supa
    .from("creatives")
    .select("id")
    .eq("kind", "video")
    .is("transcript_text", null)
    .returns<{ id: string }[]>();
  if (error) {
    console.error("[sweep:transcribe] query creatives error:", error.message);
    return { enqueued: 0, skipped: 0, totalMissing: 0 };
  }
  const missing = creatives ?? [];
  if (missing.length === 0) return { enqueued: 0, skipped: 0, totalMissing: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingJobs } = await supa
    .from("jobs")
    .select("payload, status")
    .eq("kind", "transcribe_creative")
    .in("status", ["pending", "running"])
    .returns<Array<{ payload: any; status: string }>>();

  const alreadyEnqueued = new Set<string>();
  for (const j of existingJobs ?? []) {
    const cid = j.payload?.creative_id;
    if (typeof cid === "string") alreadyEnqueued.add(cid);
  }

  const toEnqueue = missing.filter((c) => !alreadyEnqueued.has(c.id));
  let enqueued = 0;
  if (toEnqueue.length > 0) {
    const jobRows = toEnqueue.map((c) => ({
      kind: "transcribe_creative",
      payload: { creative_id: c.id },
      status: "pending",
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supa.from("jobs") as any).insert(jobRows);
    if (insErr) {
      console.error("[sweep:transcribe] insert jobs error:", insErr.message);
    } else {
      enqueued = toEnqueue.length;
    }
  }

  return {
    enqueued,
    skipped: missing.length - toEnqueue.length,
    totalMissing: missing.length,
  };
}

/**
 * dailyRefreshSweep — tiered frequency.
 *
 * Rodado a cada 1h pelo worker. Busca ofertas cujo
 * `last_refreshed_at + refresh_interval_hours` já venceu e enfileira
 * refresh_ad_count (dedupando contra jobs pending/running).
 *
 * Status consideradas: active, paused (rever regularmente pra ressurreição).
 * Status 'draft' é ignorada (ainda não publicada).
 */
export async function dailyRefreshSweep(supa: Supa): Promise<{
  eligible: number;
  enqueued: number;
  skipped: number;
}> {
  // Query JS-side: busca ofertas e filtra por interval (evita depender de RPC)
  // cast any — last_refreshed_at e refresh_interval_hours são novos, regerar types depois da migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supa as any)
    .from("offers")
    .select("id, last_refreshed_at, refresh_interval_hours")
    .in("status", ["active", "paused"])
    .returns<
      Array<{
        id: string;
        last_refreshed_at: string | null;
        refresh_interval_hours: number | null;
      }>
    >();

  const now = Date.now();
  const eligible =
    rows?.filter((r) => {
      const interval = (r.refresh_interval_hours ?? 24) * 60 * 60 * 1000;
      if (!r.last_refreshed_at) return true; // nunca atualizada
      return now - new Date(r.last_refreshed_at).getTime() >= interval;
    }) ?? [];

  if (eligible.length === 0) return { eligible: 0, enqueued: 0, skipped: 0 };

  // Dedupe: pula ofertas com refresh_ad_count pending/running
  const { data: existingJobs } = await supa
    .from("jobs")
    .select("payload, status")
    .eq("kind", "refresh_ad_count")
    .in("status", ["pending", "running"])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .returns<Array<{ payload: any; status: string }>>();

  const alreadyEnqueued = new Set<string>();
  for (const j of existingJobs ?? []) {
    const oid = j.payload?.offer_id;
    if (typeof oid === "string") alreadyEnqueued.add(oid);
  }

  const toEnqueue = eligible.filter((o) => !alreadyEnqueued.has(o.id));

  let enqueued = 0;
  if (toEnqueue.length > 0) {
    const jobRows = toEnqueue.map((o) => ({
      kind: "refresh_ad_count",
      payload: { offer_id: o.id },
      status: "pending",
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supa.from("jobs") as any).insert(jobRows);
    if (insErr) {
      console.error("[sweep:refresh] insert jobs error:", insErr.message);
    } else {
      enqueued = toEnqueue.length;
    }
  }

  return {
    eligible: eligible.length,
    enqueued,
    skipped: eligible.length - toEnqueue.length,
  };
}

/**
 * computeScoresSweep — força recomputo de scale_score pra todas active/paused.
 *
 * Roda a cada 24h. Ideal pra ofertas que ficaram estáveis (sem snapshot novo)
 * mas cuja trend pode ter mudado por causa de idade/longevity evoluindo.
 */
export async function computeScoresSweep(supa: Supa): Promise<{
  total: number;
  enqueued: number;
}> {
  const { data, error } = await supa
    .from("offers")
    .select("id")
    .in("status", ["active", "paused"])
    .returns<{ id: string }[]>();

  if (error) {
    console.error("[sweep:scores] query error:", error.message);
    return { total: 0, enqueued: 0 };
  }

  const offers = data ?? [];
  if (offers.length === 0) return { total: 0, enqueued: 0 };

  const { data: existingJobs } = await supa
    .from("jobs")
    .select("payload, status")
    .eq("kind", "compute_scale_score")
    .in("status", ["pending", "running"])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .returns<Array<{ payload: any; status: string }>>();

  const alreadyEnqueued = new Set<string>();
  for (const j of existingJobs ?? []) {
    const oid = j.payload?.offer_id;
    if (typeof oid === "string") alreadyEnqueued.add(oid);
  }

  const toEnqueue = offers.filter((o) => !alreadyEnqueued.has(o.id));

  if (toEnqueue.length === 0) return { total: offers.length, enqueued: 0 };

  const jobRows = toEnqueue.map((o) => ({
    kind: "compute_scale_score",
    payload: { offer_id: o.id },
    status: "pending",
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await (supa.from("jobs") as any).insert(jobRows);
  if (insErr) {
    console.error("[sweep:scores] insert jobs error:", insErr.message);
    return { total: offers.length, enqueued: 0 };
  }

  return { total: offers.length, enqueued: toEnqueue.length };
}

/**
 * domainDiscoverySweep — busca PROATIVA de Pages por domínio.
 *
 * Roda 1x/semana (gate no worker/index.ts). Pra cada oferta com `main_site`:
 *   1. Extrai domínio normalizado
 *   2. Chama fetchActiveAdsByDomain → retorna todos page_ids ativos rodando o domínio
 *   3. Compara com `pages.meta_page_id` existentes da oferta
 *   4. Se achou page_id novo com ≥2 ads → insere nova row em `pages` type='ad_library'
 *
 * Captura casos tipo Paulo Borges (2 Pages simultâneas) sem overhead no refresh diário.
 * Threshold de 2 ads evita spam/clones com 1 ad só.
 *
 * Serial (não paralelo) — evita rate limit do Meta + deixa cada call respirar.
 */
export async function domainDiscoverySweep(supa: Supa): Promise<{
  scanned: number;
  new_pages: number;
  skipped: number;
}> {
  // 1. Busca ofertas active/paused
  const { data: offers, error } = await supa
    .from("offers")
    .select("id, slug, status")
    .in("status", ["active", "paused"])
    .returns<{ id: string; slug: string; status: string }[]>();

  if (error || !offers || offers.length === 0) {
    if (error) console.error("[sweep:domain_discovery] query error:", error.message);
    return { scanned: 0, new_pages: 0, skipped: 0 };
  }

  // 2. Usa o helper compartilhado (mesma lógica do enrich handler)
  const browser = await getBrowser();
  let scanned = 0;
  let newPages = 0;
  let skipped = 0;

  for (const offer of offers) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await discoverPagesForOffer(supa, offer.id, {
        countries: ["BR"],
        minAdsPerPage: 2,
        browser,
      });

      if (!res.scanned) {
        skipped++;
        continue;
      }
      scanned++;

      if (res.new_pages > 0) {
        newPages += res.new_pages;
        console.log(
          `[sweep:domain_discovery] ${offer.slug} · domain=${res.domain} · +${res.new_pages} pages (source=${res.source})`
        );
      }
    } catch (err) {
      console.warn(
        `[sweep:domain_discovery] offer ${offer.slug} error:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return { scanned, new_pages: newPages, skipped };
}
