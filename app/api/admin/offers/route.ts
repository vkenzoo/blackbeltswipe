import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/offers
 * Cria uma nova oferta. Só admins podem acessar.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  // Verifica auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Verifica role admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Campos obrigatórios
  const required = ["slug", "title", "niche", "language", "structure"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `missing_${field}` },
        { status: 400 }
      );
    }
  }

  // Random thumb_gradient 1-20 se não veio
  const thumb_gradient =
    body.thumb_gradient ?? Math.floor(Math.random() * 20) + 1;

  const payload = {
    slug: body.slug,
    title: body.title,
    niche: body.niche,
    language: body.language,
    structure: body.structure,
    traffic_source: body.traffic_source ?? "facebook",
    status: body.status ?? "draft",
    ad_count: body.ad_count ?? 0,
    launched_at: body.launched_at ?? null,
    thumb_gradient,
    flags: body.flags ?? [],
    created_by: user.id,
    // Campos de VSL (opcional — admin pode criar offer sem vídeo)
    vsl_storage_path: body.vsl_storage_path ?? null,
    vsl_thumbnail_path: body.vsl_thumbnail_path ?? null,
    vsl_duration_seconds: body.vsl_duration_seconds ?? null,
    vsl_size_bytes: body.vsl_size_bytes ?? null,
    vsl_uploaded_at: body.vsl_uploaded_at ?? null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("offers") as any)
    .insert(payload)
    .select("id, slug")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 }
    );
  }

  // Se veio array `pages: [{url, type?}]`, insere em `pages` + auto-enqueue
  // screenshot_page jobs pro worker processar
  if (Array.isArray(body.pages) && body.pages.length > 0 && data?.id) {
    const pageRows = body.pages
      .filter((p: { url?: string }) => typeof p.url === "string" && p.url.trim())
      .map((p: { url: string; type?: string }) => ({
        offer_id: data.id,
        url: p.url.trim(),
        type: detectPageType(p.url, p.type),
        fetched_at: null,
      }));

    if (pageRows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: insertedPages, error: pagesErr } = await (
        supabase.from("pages") as any
      )
        .insert(pageRows)
        .select("id");
      if (pagesErr) {
        console.warn(`offer ${data.id} criada, falha ao inserir pages:`, pagesErr.message);
      } else if (insertedPages?.length > 0) {
        // Auto-enqueue screenshot pra cada page nova
        const jobRows = insertedPages.map((p: { id: string }) => ({
          kind: "screenshot_page",
          payload: { page_id: p.id },
          status: "pending",
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("jobs") as any).insert(jobRows);
      }
    }
  }

  return NextResponse.json({ ok: true, offer: data }, { status: 201 });
}

/**
 * Heurística de tipo da página pela URL.
 * - facebook.com/ads/library → ad_library
 * - facebook.com/{page} (sem /ads/) → fb_page
 * - resto → main_site
 */
function detectPageType(url: string, explicit?: string): string {
  if (explicit && ["ad_library", "fb_page", "main_site", "checkout"].includes(explicit)) {
    return explicit;
  }
  const lower = url.toLowerCase();
  if (lower.includes("facebook.com/ads/library") || lower.includes("/ads/library")) {
    return "ad_library";
  }
  if (lower.includes("facebook.com/") || lower.includes("fb.com/")) {
    return "fb_page";
  }
  return "main_site";
}
