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

  // Aceita { url: string } (legado) OU { urls: string[] } (novo, multi-link).
  // Multi-link: cria 1 oferta + enfileira N jobs (todos com mesmo offer_id),
  // assim pages aggregram na mesma oferta.
  let rawUrls: string[] = [];
  if (body?.urls && Array.isArray(body.urls)) {
    rawUrls = (body.urls as unknown[])
      .filter((u): u is string => typeof u === "string")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
  } else if (typeof body?.url === "string") {
    rawUrls = [body.url.trim()].filter((u) => u.length > 0);
  }
  if (rawUrls.length === 0) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }
  if (rawUrls.length > 10) {
    return NextResponse.json(
      { error: "too_many_urls", message: "Máximo 10 URLs por oferta" },
      { status: 400 }
    );
  }
  // Dedup preservando ordem
  const seenUrls = new Set<string>();
  const urls = rawUrls.filter((u) => {
    if (seenUrls.has(u)) return false;
    seenUrls.add(u);
    return true;
  });

  // Flag opcional: admin pode sinalizar que a oferta não tem VSL (sales
  // page texto, image-ad). Default = true (assume tem VSL). Quando false,
  // pipeline pula extract_vsl/transcribe_vsl e usa screenshot da landing.
  const hasVsl = body.has_vsl !== false;

  // Valida CADA URL antes de criar stub. Se alguma falhar, retorna erro
  // com índice — UI realça aquela específica.
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    const safe = isSafeExternalUrl(u);
    if (!safe.safe) {
      return NextResponse.json(
        { error: "unsafe_url", url_index: i, url: u, reason: safe.reason },
        { status: 400 }
      );
    }
    if (isCheckoutUrl(u)) {
      let host = "";
      try { host = new URL(u).hostname; } catch {}
      return NextResponse.json(
        {
          error: "checkout_url_rejected",
          url_index: i,
          url: u,
          message: `URL ${i + 1}: ${host} é checkout — use a landing page do advertiser`,
          host,
        },
        { status: 400 }
      );
    }
    if (isRedirectOrSocialUrl(u)) {
      let host = "";
      try { host = new URL(u).hostname; } catch {}
      return NextResponse.json(
        {
          error: "social_url_rejected",
          url_index: i,
          url: u,
          message: `URL ${i + 1}: ${host} é perfil social/shortener. Use landing ou Ad Library.`,
          host,
        },
        { status: 400 }
      );
    }
  }

  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 1. Cria stub IMEDIATO — admin vê row pulsante na lista
  //    structure = "vsl" (default) ou "carta_vendas" (admin sinalizou que
  //    oferta não tem VSL — geralmente sales letter de texto/imagens).
  //    Admin pode editar depois pra "quiz", "infoproduto" etc se for o caso.
  const placeholderSlug = `enriching-${Date.now().toString(36)}`;
  const gradient = Math.floor(Math.random() * 20) + 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stub, error: stubErr } = await (service.from("offers") as any)
    .insert({
      slug: placeholderSlug,
      title: "Extraindo...",
      niche: "renda_extra",
      language: "pt-BR",
      structure: hasVsl ? "vsl" : "carta_vendas",
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

  // 2. Pra CADA URL, decide se vai pelo path Ad Library (bulk_ad_library_prep)
  //    ou direto pelo enrich_from_url. Todas com mesmo offer_id → pages
  //    agregam na mesma oferta.
  const { extractAdLibraryPageId } = await import(
    "@/lib/worker/bulk-ad-library-prep"
  );

  const jobsToInsert: Array<{
    kind: string;
    payload: Record<string, unknown>;
    status: string;
    priority?: number;
  }> = [];

  for (const u of urls) {
    const adLibraryPageId = extractAdLibraryPageId(u);

    // Parse country (só pras Ad Library URLs)
    let countries: string[] | undefined;
    if (adLibraryPageId) {
      try {
        const c = new URL(u).searchParams.get("country");
        countries =
          !c || c.toUpperCase() === "ALL"
            ? undefined
            : [c.toUpperCase()];
      } catch {
        countries = undefined;
      }
    }

    const payload: Record<string, unknown> = adLibraryPageId
      ? {
          url: u,
          offer_id: stub.id,
          source: "from_url_ad_library",
          countries,
          has_vsl: hasVsl,
          created_by: user.id,
        }
      : {
          url: u,
          created_by: user.id,
          job_offer_id: stub.id,
          has_vsl: hasVsl,
        };

    jobsToInsert.push({
      kind: adLibraryPageId ? "bulk_ad_library_prep" : "enrich_from_url",
      payload,
      status: "pending",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs, error: jobErr } = await (service.from("jobs") as any)
    .insert(jobsToInsert)
    .select("id");

  if (jobErr || !jobs || jobs.length === 0) {
    // rollback stub
    await service.from("offers").delete().eq("id", stub.id);
    return NextResponse.json(
      { error: jobErr?.message ?? "jobs_create_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      // Backward compat: 1ª job vai como job_id
      job_id: jobs[0].id,
      job_ids: jobs.map((j: { id: string }) => j.id),
      offer_id: stub.id,
      urls_count: urls.length,
    },
    { status: 202 }
  );
}
