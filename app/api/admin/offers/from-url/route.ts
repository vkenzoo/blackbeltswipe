import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  isSafeExternalUrl,
  isCheckoutUrl,
  isRedirectOrSocialUrl,
} from "@/lib/security";

export const runtime = "nodejs";

/**
 * POST /api/admin/offers/from-url
 * Body: { url }
 *
 * Cria stub da oferta e enfileira job `enrich_from_url` no worker.
 * Retorna IMEDIATAMENTE (não espera pipeline). Client polla status via
 * GET /api/admin/jobs/[id] ou watching a row da oferta.
 */
export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null);
  if (!body?.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }

  // Validação anti-SSRF: rejeita URLs de IPs internos, metadata cloud,
  // loopback, etc. Preveniria atacante com conta admin explorar infra.
  const safe = isSafeExternalUrl(body.url);
  if (!safe.safe) {
    return NextResponse.json(
      { error: "unsafe_url", reason: safe.reason },
      { status: 400 }
    );
  }

  // Bloqueia URLs que nunca renderizam VSL: perfis sociais (Instagram,
  // TikTok, YouTube, Twitter/X, perfis FB não-Ad-Library) e checkouts.
  // Cadastro via URL sempre espera landing do advertiser ou URL do Ad
  // Library — qualquer outra coisa vira oferta órfã que nunca vai ter
  // VSL extraída.
  const trimmed = body.url.trim();
  if (isCheckoutUrl(trimmed)) {
    let host = "";
    try { host = new URL(trimmed).hostname; } catch {}
    return NextResponse.json(
      {
        error: "checkout_url_rejected",
        message: `${host} é checkout — use a landing page do advertiser em vez disso`,
        host,
      },
      { status: 400 }
    );
  }
  if (isRedirectOrSocialUrl(trimmed)) {
    let host = "";
    try { host = new URL(trimmed).hostname; } catch {}
    return NextResponse.json(
      {
        error: "social_url_rejected",
        message: `${host} é perfil social (Instagram/TikTok/YouTube/FB) ou shortener. Cole a URL da landing page do advertiser ou a URL do Ad Library (facebook.com/ads/library/...).`,
        host,
      },
      { status: 400 }
    );
  }

  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 1. Cria stub IMEDIATO — admin vê row pulsante na lista
  const placeholderSlug = `enriching-${Date.now().toString(36)}`;
  const gradient = Math.floor(Math.random() * 20) + 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stub, error: stubErr } = await (service.from("offers") as any)
    .insert({
      slug: placeholderSlug,
      title: "Extraindo...",
      niche: "renda_extra",
      language: "pt-BR",
      structure: "vsl",
      traffic_source: "facebook",
      status: "draft",
      ad_count: 0,
      launched_at: new Date().toISOString().slice(0, 10),
      thumb_gradient: gradient,
      flags: [],
      created_by: user.id,
    })
    .select("id")
    .single();
  if (stubErr || !stub) {
    return NextResponse.json(
      { error: stubErr?.message ?? "stub_create_failed" },
      { status: 500 }
    );
  }

  // 2. Rota inteligente: se URL é Ad Library com view_all_page_id, usa o
  //    handler `bulk_ad_library_prep` que:
  //    - Chama Meta API /ads_archive pra descobrir a landing REAL do
  //      advertiser (em vez de fazer Playwright na UI do Ad Library)
  //    - Registra page ad_library + page checkout (se detectado)
  //    - Só depois enfileira enrich_from_url pra landing real (com VSL)
  //    Economiza ~3-5min de worker em ofertas Ad Library e evita
  //    ofertas `ready_no_vsl` falsas quando advertiser tem VSL mas a UI
  //    do Ad Library não expõe os players.
  const { extractAdLibraryPageId } = await import(
    "@/lib/worker/bulk-ad-library-prep"
  );
  const adLibraryPageId = extractAdLibraryPageId(body.url.trim());

  // Parse country da URL: Ad Library tem &country=BR ou &country=ALL.
  // ALL → handler usa multi-país default. País único → array de 1.
  let countries: string[] | undefined;
  if (adLibraryPageId) {
    try {
      const c = new URL(body.url.trim()).searchParams.get("country");
      countries =
        !c || c.toUpperCase() === "ALL"
          ? undefined // handler usa multi-country default
          : [c.toUpperCase()];
    } catch {
      countries = undefined;
    }
  }

  const jobPayload: Record<string, unknown> = adLibraryPageId
    ? {
        url: body.url.trim(),
        offer_id: stub.id,
        source: "from_url_ad_library",
        countries, // array (multi-país) ou undefined (handler usa default)
        created_by: user.id,
      }
    : {
        url: body.url.trim(),
        created_by: user.id,
        job_offer_id: stub.id,
      };
  const jobKind = adLibraryPageId ? "bulk_ad_library_prep" : "enrich_from_url";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobErr } = await (service.from("jobs") as any)
    .insert({
      kind: jobKind,
      payload: jobPayload,
      status: "pending",
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    // rollback stub
    await service.from("offers").delete().eq("id", stub.id);
    return NextResponse.json(
      { error: jobErr?.message ?? "job_create_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    job_id: job.id,
    offer_id: stub.id,
  }, { status: 202 });
}
