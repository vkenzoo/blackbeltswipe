import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { enrichUrl } from "@/lib/worker/enrich";
import type { Database } from "@/lib/supabase/types";

// Playwright precisa de tempo (30-60s) pra carregar + scroll + screenshot
export const maxDuration = 120;
// Node runtime (chromium binary não roda em edge)
export const runtime = "nodejs";

/**
 * POST /api/admin/offers/[id]/enrich
 * Body: { url: string }
 *
 * Dispara o worker Playwright pra extrair screenshot + ad_count + criativos
 * da URL dada. Sync: retorna quando Playwright termina (pode demorar 30-60s).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth: admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: offerId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(body.url)) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  // Pega slug pra usar como prefixo no bucket
  const { data: offer } = await supabase
    .from("offers")
    .select("slug")
    .eq("id", offerId)
    .maybeSingle<{ slug: string }>();
  if (!offer) {
    return NextResponse.json({ error: "offer_not_found" }, { status: 404 });
  }

  // Usa service role pro worker (bypass RLS, pode inserir em creatives/pages)
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const service = createServiceClient<Database>(serviceUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const result = await enrichUrl(service, offerId, offer.slug, body.url);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "unknown" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    pageType: result.pageType,
    pageTitle: result.pageTitle,
    adCount: result.adCount,
    creativesCreated: result.creativesCreated,
    landingPagesCreated: result.landingPagesCreated ?? 0,
    checkoutPagesCreated: result.checkoutPagesCreated ?? 0,
    debug: result.debug,
  });
}
