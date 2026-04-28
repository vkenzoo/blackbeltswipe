import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/offers/[id]/monitored-pages
 * Lista páginas Ad Library monitoradas pelo worker diário.
 *
 * POST /api/admin/offers/[id]/monitored-pages
 * Body: { url: string, title?: string }
 * Cria uma nova page type='ad_library' + extrai meta_page_id do URL.
 * Retorna a row criada.
 */

function extractMetaPageId(url: string): string | null {
  const m = url.match(/view_all_page_id=(\d+)/);
  return m ? m[1] : null;
}

/**
 * Normaliza URL do Ad Library pra garantir scrape consistente:
 *   - country=ALL (em vez de BR/PT) — UI agrega ads de todos os países,
 *     match com o que user cola quando olha a página pública
 *   - is_targeted_country=false (mostra ads sem segmentação explícita)
 *   - active_status=active + ad_type=all + media_type=all + search_type=page
 *
 * Admin cola qualquer URL que vem do browser; a gente re-escreve pro formato
 * canônico. Assim Layer 2 scrape vê o mesmo "~X resultados" que o user vê.
 */
function normalizeAdLibraryUrl(input: string): string {
  const pageId = extractMetaPageId(input);
  if (!pageId) return input; // não dá pra normalizar sem page_id
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "ALL",
    is_targeted_country: "false",
    media_type: "all",
    search_type: "page",
    "sort_data[direction]": "desc",
    "sort_data[mode]": "total_impressions",
    view_all_page_id: pageId,
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "unauthorized" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (profile?.role !== "admin") {
    return { ok: false as const, status: 403, error: "forbidden" };
  }
  return { ok: true as const, user };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const service = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (service as any)
    .from("pages")
    .select(
      "id, url, title, meta_page_id, visible, display_order, screenshot_url, fetched_at, created_at"
    )
    .eq("offer_id", id)
    .eq("type", "ad_library")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  return NextResponse.json({ pages: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: offerId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    title?: string;
  };

  const url = body.url?.trim();
  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  // Valida: é Ad Library?
  if (!/facebook\.com\/ads\/library/i.test(url)) {
    return NextResponse.json(
      { error: "not_ad_library_url", message: "URL precisa ser do Ad Library do Facebook" },
      { status: 400 }
    );
  }

  const metaPageId = extractMetaPageId(url);
  const normalizedUrl = normalizeAdLibraryUrl(url);
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

  // Dedup: já existe essa page_id cadastrada?
  if (metaPageId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (service as any)
      .from("pages")
      .select("id")
      .eq("offer_id", offerId)
      .eq("type", "ad_library")
      .eq("meta_page_id", metaPageId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "duplicate", message: `Essa Page (${metaPageId}) já está monitorada` },
        { status: 409 }
      );
    }
  }

  // Próximo display_order
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingPages } = await (service as any)
    .from("pages")
    .select("display_order")
    .eq("offer_id", offerId)
    .eq("type", "ad_library")
    .order("display_order", { ascending: false })
    .limit(1);
  const nextOrder =
    existingPages && existingPages.length > 0
      ? (existingPages[0].display_order ?? 0) + 1
      : 0;

  // Policy: 1ª page da oferta entra verified (admin cadastrando a Page
  // principal do advertiser). 2ª+ entram UNVERIFIED — admin aprova uma
  // a uma via botão na UI, evitando contaminação em burst como a de
  // 2026-04-20 (17 pages inseridas de advertisers diferentes).
  const isFirstPage = nextOrder === 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (service.from("pages") as any)
    .insert({
      offer_id: offerId,
      type: "ad_library",
      url: normalizedUrl,
      title: body.title ?? `Ad Library · page_id ${metaPageId ?? "?"}`,
      meta_page_id: metaPageId,
      visible: true,
      display_order: nextOrder,
      verified_for_sync: isFirstPage,
      discovered_via: isFirstPage ? "manual" : "manual_multi_page_review",
    })
    .select(
      "id, url, title, meta_page_id, visible, display_order, screenshot_url, fetched_at, created_at"
    )
    .single();

  if (error) {
    console.error("[monitored-pages POST] insert error:", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  // Enfileira refresh_ad_count imediato com priority alta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (service.from("jobs") as any).insert({
    kind: "refresh_ad_count",
    payload: { offer_id: offerId },
    status: "pending",
    priority: 100,
  });

  return NextResponse.json({ ok: true, page: inserted }, { status: 201 });
}
