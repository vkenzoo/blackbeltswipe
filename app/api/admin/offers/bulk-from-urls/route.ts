import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  isSafeExternalUrl,
  isCheckoutUrl,
  isRedirectOrSocialUrl,
} from "@/lib/security";
import { extractAdLibraryPageId } from "@/lib/worker/bulk-ad-library-prep";

export const runtime = "nodejs";

/**
 * POST /api/admin/offers/bulk-from-urls
 * Body: { urls: string[] }
 *
 * Versão em lote do from-url. Cria N stubs + enfileira N jobs de uma vez.
 * Útil pra admin subir 10-50 ofertas a partir de uma lista de links do
 * Ad Library.
 *
 * Validação por URL:
 *   - URL válida (http/https)
 *   - Não aponta pra IP interno (SSRF)
 *   - Não ultrapassa MAX_URLS_PER_REQUEST
 *   - Duplicadas entre si (no body) são deduplicadas
 *
 * Retorna `{ created: [{ url, offer_id, job_id }], errors: [{ url, error }] }`.
 * Status 207 se houve erros parciais.
 */

const MAX_URLS_PER_REQUEST = 50;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  if (!body || !Array.isArray(body.urls)) {
    return NextResponse.json(
      { error: "missing_urls", message: "Body deve ter urls: string[]" },
      { status: 400 }
    );
  }

  const rawUrls = (body.urls as unknown[])
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  if (rawUrls.length === 0) {
    return NextResponse.json({ error: "no_urls_provided" }, { status: 400 });
  }

  if (rawUrls.length > MAX_URLS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: "too_many_urls",
        max: MAX_URLS_PER_REQUEST,
        received: rawUrls.length,
      },
      { status: 400 }
    );
  }

  // Dedup no próprio request (mantém ordem da 1ª ocorrência)
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const u of rawUrls) {
    if (!seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }

  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const created: Array<{ url: string; offer_id: string; job_id: string; slug: string }> = [];
  const errors: Array<{ url: string; error: string; reason?: string }> = [];

  // Processa sequencialmente pra ter slugs únicos e não saturar o DB
  for (const url of urls) {
    // 1. Valida SSRF
    const safe = isSafeExternalUrl(url);
    if (!safe.safe) {
      errors.push({ url, error: "unsafe_url", reason: safe.reason });
      continue;
    }

    // 2. Rejeita URLs de checkout direto — nunca têm VSL.
    //    Admin deve colar Ad Library URL ou landing, não pay.hotmart direto.
    if (isCheckoutUrl(url)) {
      errors.push({
        url,
        error: "checkout_url",
        reason: "URL de checkout (hotmart/kiwify/etc) não tem VSL — cola URL do Ad Library ou da landing",
      });
      continue;
    }

    // 2b. Rejeita URLs sociais (Instagram, TikTok, YouTube, perfis FB,
    //     shorteners) — não têm VSL extraível. Exceção: URLs do Ad Library
    //     do FB (facebook.com/ads/library/...) passam, porque isRedirectOrSocialUrl
    //     whitelista esse path.
    if (isRedirectOrSocialUrl(url)) {
      let host = "";
      try { host = new URL(url).hostname; } catch {}
      errors.push({
        url,
        error: "social_url",
        reason: `${host} é perfil social (Instagram/TikTok/YouTube/FB) ou shortener — cole a URL da landing do advertiser ou do Ad Library`,
      });
      continue;
    }

    // 3. Cria stub offer — slug com UUID evita collision em bulk simultâneo.
    // Usa só 16 chars do UUID (suficiente pra unicidade + mantém URL curta).
    const uuid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const placeholderSlug = `enriching-${uuid}`;
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
      .select("id, slug")
      .single();

    if (stubErr || !stub) {
      errors.push({
        url,
        error: "stub_create_failed",
        reason: stubErr?.message,
      });
      continue;
    }

    // 4. Decide qual job enfileirar:
    //    - Ad Library URL (view_all_page_id) → bulk_ad_library_prep (rápido,
    //      descobre a landing real via Meta API, concurrency 5)
    //    - Outra URL qualquer → enrich_from_url direto (legado, concurrency 1)
    const isAdLibrary = extractAdLibraryPageId(url) !== null;
    const jobKind = isAdLibrary ? "bulk_ad_library_prep" : "enrich_from_url";

    // Parse country da URL: Ad Library tem &country=BR ou &country=ALL.
    // ALL → multi-país (handler usa default global). País único → array de 1.
    let countries: string[] | undefined;
    if (isAdLibrary) {
      try {
        const c = new URL(url).searchParams.get("country");
        countries =
          !c || c.toUpperCase() === "ALL"
            ? undefined // handler usa multi-country default
            : [c.toUpperCase()];
      } catch {
        countries = undefined;
      }
    }

    const jobPayload = isAdLibrary
      ? {
          offer_id: stub.id,
          url,
          countries, // array (multi-país) ou undefined (handler usa default)
          created_by: user.id,
          source: "bulk_ad_library",
        }
      : {
          url,
          created_by: user.id,
          job_offer_id: stub.id,
          source: "bulk_ad_library",
        };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job, error: jobErr } = await (service.from("jobs") as any)
      .insert({
        kind: jobKind,
        payload: jobPayload,
        status: "pending",
        priority: 70,
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      // rollback stub
      await service.from("offers").delete().eq("id", stub.id);
      errors.push({
        url,
        error: "job_create_failed",
        reason: jobErr?.message,
      });
      continue;
    }

    created.push({
      url,
      offer_id: stub.id,
      slug: stub.slug,
      job_id: job.id,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      total_requested: urls.length,
      created,
      errors,
    },
    { status: errors.length > 0 ? 207 : 202 }
  );
}
