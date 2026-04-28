import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/offers/[id]/refresh
 *
 * Enfileira refresh_ad_count + compute_scale_score com priority=100
 * (fura a fila dos sweeps que usam priority=0).
 *
 * Resposta: { ok: true, job_id: <refresh_ad_count_job_id> }
 *
 * Client pode usar o job_id pra pollar status em /api/admin/jobs/[id]
 * e mostrar "⟳ Atualizando..." enquanto roda.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth: só admin
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

  const { id } = await params;

  // Valida oferta existe
  const { data: offer } = await supabase
    .from("offers")
    .select("id, slug, title")
    .eq("id", id)
    .maybeSingle<{ id: string; slug: string; title: string }>();
  if (!offer) {
    return NextResponse.json({ error: "offer_not_found" }, { status: 404 });
  }

  // Service role pra enfileirar (bypassa RLS de jobs)
  const service = createServiceClient();

  // 1. Enfileira refresh_ad_count com priority alta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: refreshJob, error } = await (service.from("jobs") as any)
    .insert({
      kind: "refresh_ad_count",
      payload: { offer_id: id },
      status: "pending",
      priority: 100, // fura fila
    })
    .select("id")
    .single();

  if (error) {
    console.error("[refresh API] insert job error:", error);
    return NextResponse.json({ error: "enqueue_failed" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      job_id: refreshJob.id,
      offer_slug: offer.slug,
      message: `Enfileirado refresh pra "${offer.title}"`,
    },
    { status: 202 }
  );
}
