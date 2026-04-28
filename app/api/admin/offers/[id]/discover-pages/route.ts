import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/offers/[id]/discover-pages
 *
 * Dispara descoberta manual de Ad Library pages via domain search.
 * Usa o domínio do main_site (ou checkout fallback) da oferta.
 *
 * Não roda síncronamente (usa Playwright que demora 10-30s) — enfileira
 * um job de refresh_ad_count que já incorpora descoberta via Layer 3 do
 * handler. Resposta 202 imediata com job_id pro client pollar.
 *
 * Admin-only.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: offerId } = await params;

  const service = createServiceClient();
  // Valida oferta existe
  const { data: offer } = await service
    .from("offers")
    .select("id, slug")
    .eq("id", offerId)
    .maybeSingle<{ id: string; slug: string }>();
  if (!offer) {
    return NextResponse.json({ error: "offer_not_found" }, { status: 404 });
  }

  // Valida que tem main_site ou checkout
  const { data: sitePages } = await service
    .from("pages")
    .select("url, type")
    .eq("offer_id", offerId)
    .in("type", ["main_site", "checkout"]);
  if (!sitePages || sitePages.length === 0) {
    return NextResponse.json(
      {
        error: "no_landing_url",
        message:
          "Adicione primeiro uma URL de site principal (main_site) ou checkout pra descobrir Pages via domínio.",
      },
      { status: 400 }
    );
  }

  // Enfileira refresh_ad_count com priority alta (o handler já roda Layer 3
  // de domain discovery quando Layer 1+2 zera OU sempre se não tem page)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error } = await (service.from("jobs") as any)
    .insert({
      kind: "refresh_ad_count",
      payload: { offer_id: offerId },
      status: "pending",
      priority: 100,
    })
    .select("id")
    .single();

  if (error || !job) {
    return NextResponse.json(
      { error: "enqueue_failed", detail: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      job_id: job.id,
      offer_slug: offer.slug,
      message: "Descoberta enfileirada · worker vai escanear por domínio em segundos",
    },
    { status: 202 }
  );
}
