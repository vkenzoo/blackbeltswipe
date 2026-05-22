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
 * POST /api/admin/offers/[id]/extract-creatives-from-url
 *
 * Body: { url } ou { urls: string[] }
 *
 * Adiciona criativos a uma oferta EXISTENTE a partir de URLs externas:
 *   - Se a URL é Ad Library com view_all_page_id → enfileira
 *     bulk_ad_library_prep (Meta API descobre ads + cria pages + Playwright
 *     extrai creatives)
 *   - Se é landing/keyword search → enfileira enrich_from_url (Playwright
 *     direto na URL pra encontrar landings + creatives)
 *
 * Cap de 30 criativos por oferta é respeitado nos handlers — se a oferta
 * já tá no limite, eles fazem early return.
 *
 * Diferente de POST /api/admin/offers/from-url:
 *   - Esse aqui REUSA offer_id existente (não cria stub)
 *   - Foco em criativos (não na criação inicial de oferta)
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: offerId } = await ctx.params;
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

  // Aceita { url } ou { urls: string[] }
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
  if (rawUrls.length > 5) {
    return NextResponse.json(
      { error: "too_many_urls", message: "Máximo 5 URLs por extração" },
      { status: 400 }
    );
  }

  // Dedup preservando ordem
  const seen = new Set<string>();
  const urls = rawUrls.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  // Valida cada URL
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
          message: `URL ${i + 1}: ${host} é checkout — use landing ou Ad Library`,
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
          message: `URL ${i + 1}: ${host} é perfil social — use landing ou Ad Library`,
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

  // Confirma que oferta existe
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offer } = await (service as any)
    .from("offers")
    .select("id, slug, title")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) {
    return NextResponse.json({ error: "offer_not_found" }, { status: 404 });
  }

  // Decide kind por URL — mesmo critério do endpoint from-url
  const { extractAdLibraryPageId } = await import(
    "@/lib/worker/bulk-ad-library-prep"
  );

  const jobsToInsert = urls.map((u) => {
    const adLibraryPageId = extractAdLibraryPageId(u);

    let countries: string[] | undefined;
    if (adLibraryPageId) {
      try {
        const c = new URL(u).searchParams.get("country");
        countries =
          !c || c.toUpperCase() === "ALL" ? undefined : [c.toUpperCase()];
      } catch {
        countries = undefined;
      }
    }

    const payload: Record<string, unknown> = adLibraryPageId
      ? {
          url: u,
          offer_id: offerId,
          source: "extract_creatives_admin",
          countries,
          created_by: user.id,
        }
      : {
          url: u,
          created_by: user.id,
          job_offer_id: offerId,
        };

    return {
      kind: adLibraryPageId ? "bulk_ad_library_prep" : "enrich_from_url",
      payload,
      status: "pending" as const,
      priority: 75, // admin action — prioridade alta
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs, error } = await (service.from("jobs") as any)
    .insert(jobsToInsert)
    .select("id");

  if (error || !jobs) {
    return NextResponse.json(
      { error: error?.message ?? "jobs_create_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      offer_id: offerId,
      job_ids: jobs.map((j: { id: string }) => j.id),
      urls_count: urls.length,
      message: `${urls.length} extração${urls.length > 1 ? "ões" : ""} enfileirada${urls.length > 1 ? "s" : ""}. Aguarda ~2-3min por URL.`,
    },
    { status: 202 }
  );
}
