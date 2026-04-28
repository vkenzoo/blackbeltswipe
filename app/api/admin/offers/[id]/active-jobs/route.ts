/**
 * GET /api/admin/offers/[id]/active-jobs
 *
 * Retorna jobs running/pending relacionados a essa oferta. Usado pela UI
 * do edit page pra detectar quando há trabalho em andamento mesmo se o
 * user refresh da página — banner "Worker extraindo VSL..." agora é
 * dirigido pelo estado REAL do DB, não por state React local.
 *
 * Inclui jobs linkados via `payload.offer_id` OU `payload.job_offer_id`
 * (inconsistência histórica do schema).
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type OutJob = {
  id: string;
  kind: string;
  status: "pending" | "running";
  started_at: string | null;
  created_at: string;
  elapsed_seconds: number;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supa = createServiceClient();

  // Kinds relevantes pra UI do edit (pipeline de VSL + AI + thumb)
  const KINDS = [
    "enrich_from_url",
    "enrich_offer",
    "extract_vsl",
    "generate_thumb",
    "transcribe_vsl",
    "ai_authoring",
    "bulk_ad_library_prep",
    "refresh_ad_count",
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supa as any)
    .from("jobs")
    .select("id, kind, status, payload, started_at, created_at")
    .in("kind", KINDS)
    .in("status", ["pending", "running"])
    .or(`payload->>offer_id.eq.${id},payload->>job_offer_id.eq.${id}`)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    kind: string;
    status: "pending" | "running";
    started_at: string | null;
    created_at: string;
  }>;

  const now = Date.now();
  const jobs: OutJob[] = rows.map((j) => ({
    id: j.id,
    kind: j.kind,
    status: j.status,
    started_at: j.started_at,
    created_at: j.created_at,
    elapsed_seconds: j.started_at
      ? Math.floor((now - new Date(j.started_at).getTime()) / 1000)
      : 0,
  }));

  return NextResponse.json({
    jobs,
    has_running: jobs.some((j) => j.status === "running"),
    has_pending: jobs.some((j) => j.status === "pending"),
    fetched_at: new Date().toISOString(),
  });
}
