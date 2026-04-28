import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/offers/bulk-status?ids=uuid1,uuid2,...
 *
 * Retorna status consolidado de cada oferta pra UI de bulk import
 * desenhar a timeline animada de progresso.
 *
 * Stages possíveis (na ordem do pipeline):
 *   1. queued             — stub criado, job enrich_from_url pending
 *   2. extracting_vsl     — enrich_from_url running (baixando mp4/hls)
 *   3. generating_thumb   — generate_thumb running
 *   4. transcribing       — transcribe_vsl running
 *   5. ai_drafting        — ai_authoring running
 *   6. syncing_creatives  — sync_creatives running
 *   7. ready              — tudo pronto, aguardando aprovação
 *   8. error              — último job deu erro
 */

export type BulkStage =
  | "queued"
  | "prep_landing"          // bulk_ad_library_prep: descobrindo landing real via Meta API
  | "extracting_vsl"
  | "generating_thumb"
  | "transcribing"
  | "ai_drafting"
  | "syncing_creatives"
  | "ready"                 // completo: VSL + transcript + AI draft
  | "ready_no_vsl"          // completo mas sem VSL (só screenshots da landing)
  | "error";

export type BulkOfferStatus = {
  offer_id: string;
  slug: string;
  title: string;
  status: string;
  stage: BulkStage;
  /** Progresso estimado 0-100 pra UI */
  progress: number;
  /** Flags granulares pro admin entender o que já rolou */
  has_vsl: boolean;
  has_thumb: boolean;
  has_transcript: boolean;
  has_ai_draft: boolean;
  /** Último job rodando/finalizado (kind + status) */
  last_job_kind: string | null;
  last_job_status: string | null;
  last_error: string | null;
};

const STAGE_PROGRESS: Record<BulkStage, number> = {
  queued: 5,
  prep_landing: 15,
  extracting_vsl: 30,
  generating_thumb: 50,
  transcribing: 65,
  ai_drafting: 82,
  syncing_creatives: 92,
  ready: 100,
  ready_no_vsl: 100,
  error: 100,
};

export async function GET(req: Request) {
  await requireAdmin();

  const url = new URL(req.url);
  const idsRaw = url.searchParams.get("ids") ?? "";
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 100);

  if (ids.length === 0) {
    return NextResponse.json({ statuses: [] });
  }

  const supa = createServiceClient();

  // 1. Busca offers em 1 query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offersRaw } = await (supa as any)
    .from("offers")
    .select(
      "id, slug, title, status, vsl_storage_path, vsl_thumbnail_path, transcript_text, ai_draft, ai_generated_at, ai_accepted_at, created_at"
    )
    .in("id", ids);

  const offers = (offersRaw ?? []) as Array<{
    id: string;
    slug: string;
    title: string;
    status: string;
    vsl_storage_path: string | null;
    vsl_thumbnail_path: string | null;
    transcript_text: string | null;
    ai_draft: unknown | null;
    ai_generated_at: string | null;
    ai_accepted_at: string | null;
    created_at: string;
  }>;

  // 2. Busca último job por offer_id (jobs são ligados via payload.job_offer_id
  //    no enrich_from_url, ou payload.offer_id em outros)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobsRaw } = await (supa as any)
    .from("jobs")
    .select("id, kind, status, payload, error, created_at, started_at, finished_at")
    .in(
      "kind",
      [
        "bulk_ad_library_prep",
        "enrich_from_url",
        "generate_thumb",
        "transcribe_vsl",
        "ai_authoring",
        "sync_creatives",
      ]
    )
    .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // últimas 2h
    .order("created_at", { ascending: false })
    .limit(500);

  const jobs = (jobsRaw ?? []) as Array<{
    id: string;
    kind: string;
    status: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any;
    error: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
  }>;

  // Mapa: offer_id → jobs mais recentes (ordenados por created_at desc)
  const jobsByOffer = new Map<string, typeof jobs>();
  for (const j of jobs) {
    const offerId = j.payload?.offer_id ?? j.payload?.job_offer_id;
    if (!offerId) continue;
    if (!jobsByOffer.has(offerId)) jobsByOffer.set(offerId, []);
    jobsByOffer.get(offerId)!.push(j);
  }

  // 3. Resolve stage de cada oferta
  const statuses: BulkOfferStatus[] = offers.map((o) => {
    const offerJobs = jobsByOffer.get(o.id) ?? [];
    const runningJob = offerJobs.find((j) => j.status === "running");
    const lastJob = offerJobs[0] ?? null;
    const errorJob = offerJobs.find((j) => j.status === "error");

    const hasVsl = !!o.vsl_storage_path;
    const hasThumb = !!o.vsl_thumbnail_path;
    const hasTranscript = !!o.transcript_text && o.transcript_text.length > 100;
    const hasAiDraft = !!o.ai_draft;

    let stage: BulkStage;
    let lastError: string | null = null;

    if (errorJob && (!runningJob || errorJob.created_at > runningJob.created_at)) {
      // Último evento foi um erro não resolvido por outro job rodando
      stage = "error";
      lastError = errorJob.error;
    } else if (runningJob) {
      // Maps job kind → stage name
      switch (runningJob.kind) {
        case "bulk_ad_library_prep":
          stage = "prep_landing";
          break;
        case "enrich_from_url":
          stage = hasVsl && !hasTranscript ? "transcribing" : "extracting_vsl";
          break;
        case "generate_thumb":
          stage = "generating_thumb";
          break;
        case "transcribe_vsl":
          stage = "transcribing";
          break;
        case "ai_authoring":
          stage = "ai_drafting";
          break;
        case "sync_creatives":
          stage = "syncing_creatives";
          break;
        default:
          stage = "extracting_vsl";
      }
    } else if (hasVsl && hasTranscript && hasAiDraft) {
      stage = "ready";
    } else if (lastJob?.status === "done") {
      // Último job finalizou OK. Avalia o estado final:
      //   - Tem VSL + transcript + AI → ready (caso principal)
      //   - Tem VSL + transcript sem AI → aguarda ai_authoring na fila
      //   - Tem VSL sem transcript → aguarda transcribe na fila
      //   - Enrich terminou MAS sem VSL → landing não tinha VSL.
      //     Se pelo menos 1 page + thumb existem, considerar "pronto
      //     pra revisão só com screenshots" (ready_no_vsl).
      const enrichDone = offerJobs.some(
        (j) => j.kind === "enrich_from_url" && j.status === "done"
      );
      const enrichExists = offerJobs.some(
        (j) => j.kind === "enrich_from_url"
      );
      const bulkPrepDone = offerJobs.some(
        (j) => j.kind === "bulk_ad_library_prep" && j.status === "done"
      );
      if (hasVsl && hasTranscript && !hasAiDraft) stage = "ai_drafting";
      else if (hasVsl && !hasTranscript) stage = "transcribing";
      else if (!hasVsl && enrichDone) {
        // enrich já rodou e landing não tinha VSL — estado terminal.
        // Thumb é opcional: VSL inexistente → thumb também inexistente.
        stage = "ready_no_vsl";
      } else if (!hasVsl && bulkPrepDone && !enrichExists) {
        // bulk_ad_library_prep terminou mas DECIDIU não enfileirar enrich —
        // todos ads apontam pro checkout (sem landing intermediária válida).
        // Estado terminal: ad_library page + criativos vão ser syncados.
        // UI precisa sair de "baixando VSL" e admin decide se arquiva ou aprova.
        stage = "ready_no_vsl";
      } else if (!hasVsl) stage = "extracting_vsl";
      else stage = "ready";
    } else {
      // Sem job running e sem job done recente → ainda na fila
      stage = "queued";
    }

    return {
      offer_id: o.id,
      slug: o.slug,
      title: o.title,
      status: o.status,
      stage,
      progress: STAGE_PROGRESS[stage],
      has_vsl: hasVsl,
      has_thumb: hasThumb,
      has_transcript: hasTranscript,
      has_ai_draft: hasAiDraft,
      last_job_kind: lastJob?.kind ?? null,
      last_job_status: lastJob?.status ?? null,
      last_error: lastError,
    };
  });

  return NextResponse.json({
    statuses,
    fetched_at: new Date().toISOString(),
  });
}
