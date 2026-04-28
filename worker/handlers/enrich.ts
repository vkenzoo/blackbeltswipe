import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Niche } from "@/lib/types";
import { enrichUrl } from "@/lib/worker/enrich";
import { classifyNiche } from "@/lib/worker/classify";
import { transcribeFromStorage } from "@/lib/worker/transcribe";
import { discoverPagesForOffer } from "@/lib/worker/discover-pages-for-offer";
import { syncCreativesFromApi } from "@/lib/worker/sync-creatives-from-api";
import { getBrowser } from "../shared-browser";

type Supa = SupabaseClient<Database>;

/**
 * Handler: enrich_from_url
 * Cria oferta stub, roda worker, classifica nicho, transcreve, finaliza.
 * Payload: { url, created_by }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleEnrichFromUrl(supa: Supa, payload: any): Promise<void> {
  const { url, created_by, job_offer_id } = payload as {
    url: string;
    created_by: string;
    job_offer_id?: string; // se vier, reusa stub já criado pelo endpoint
  };
  if (!url) throw new Error("missing url");

  // 1. Cria ou reusa stub
  let offerId = job_offer_id;
  let offerSlug: string;

  if (offerId) {
    const { data: existing } = await supa
      .from("offers")
      .select("slug")
      .eq("id", offerId)
      .maybeSingle<{ slug: string }>();
    if (!existing) throw new Error(`stub offer ${offerId} não existe`);
    offerSlug = existing.slug;
  } else {
    offerSlug = `enriching-${Date.now().toString(36)}`;
    const gradient = Math.floor(Math.random() * 20) + 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stub, error } = await (supa.from("offers") as any)
      .insert({
        slug: offerSlug,
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
        created_by,
      })
      .select("id")
      .single();
    if (error || !stub) throw new Error(error?.message ?? "stub_create_failed");
    offerId = stub.id;
  }

  // 2. Roda enrichment
  const result = await enrichUrl(supa, offerId as string, offerSlug, url);
  if (!result.ok) {
    // rollback — deleta stub
    if (!job_offer_id) {
      await supa.from("offers").delete().eq("id", offerId as string);
    }
    throw new Error(result.error ?? "enrichment_failed");
  }

  // 3. Deriva título + slug únicos
  type PageRow = { type: string; url: string; title: string | null };
  const { data: pagesRaw } = await supa
    .from("pages")
    .select("type, url, title")
    .eq("offer_id", offerId as string)
    .returns<PageRow[]>();
  const pages = pagesRaw ?? [];

  const byType = (t: string) => pages.find((p) => p.type === t && p.title)?.title ?? null;
  let finalTitle = byType("main_site") ?? byType("ad_library") ?? null;
  if (finalTitle && /^biblioteca de an[úu]ncios$/i.test(finalTitle.trim())) finalTitle = null;
  if (!finalTitle) {
    const landing = pages.find((p) => p.type === "main_site");
    if (landing?.url) {
      try {
        finalTitle = new URL(landing.url).hostname.replace(/^www\./, "");
      } catch {}
    }
  }
  if (!finalTitle) finalTitle = "Oferta sem título";

  const baseSlug = slugify(finalTitle) || `oferta-${Date.now().toString(36)}`;
  let uniqueSlug = baseSlug;
  let suffix = 2;
  while (true) {
    const { data: collision } = await supa
      .from("offers")
      .select("id")
      .eq("slug", uniqueSlug)
      .neq("id", offerId as string)
      .maybeSingle();
    if (!collision) break;
    uniqueSlug = `${baseSlug}-${suffix}`;
    suffix++;
    if (suffix > 50) break;
  }

  // 4. Landing screenshot como thumb fallback (se worker não setou via VSL)
  const { data: landing } = await supa
    .from("pages")
    .select("screenshot_url")
    .eq("offer_id", offerId as string)
    .eq("type", "main_site")
    .limit(1)
    .maybeSingle<{ screenshot_url: string | null }>();

  // 5. Niche classification
  let detectedNiche: Niche | null = null;
  try {
    detectedNiche = await classifyNiche(
      finalTitle,
      result.landingBodyText ?? undefined,
      result.adBodyTexts
    );
  } catch (err) {
    console.warn("[enrich_from_url] classify fail:", err);
  }

  // 6. Update offer final
  const offerPatch: Record<string, unknown> = {
    title: finalTitle,
    slug: uniqueSlug,
  };
  // Thumb: preferir o thumb gerado do VSL (já salvo pelo worker), senão landing
  if (result.vslThumbnailPath) {
    offerPatch.vsl_thumbnail_path = result.vslThumbnailPath;
  } else if (landing?.screenshot_url) {
    offerPatch.vsl_thumbnail_path = landing.screenshot_url;
  }
  if (detectedNiche) offerPatch.niche = detectedNiche;
  if (result.vslStoragePath) {
    offerPatch.vsl_storage_path = result.vslStoragePath;
    offerPatch.vsl_size_bytes = result.vslSizeBytes ?? null;
    offerPatch.vsl_uploaded_at = new Date().toISOString();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa.from("offers") as any).update(offerPatch).eq("id", offerId as string);

  // 7. Transcribe VSL se baixada
  if (result.vslStoragePath) {
    try {
      const tr = await transcribeFromStorage(supa, result.vslStoragePath);
      if (tr.ok && tr.text) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supa.from("offers") as any)
          .update({
            transcript_text: tr.text,
            transcript_preview: tr.preview,
            vsl_duration_seconds: tr.duration,
          })
          .eq("id", offerId as string);
      }
    } catch (err) {
      console.warn("[enrich_from_url] transcribe fail:", err);
    }
  }

  // 8. Auto-discover Ad Library pages via domain search
  // DESABILITADO por padrão (gerava contaminação de criativos).
  // Pages descobertas entram verified_for_sync=FALSE — não contaminam
  // sync-creatives, mas admin pode revisar depois.
  // Reativar via DOMAIN_DISCOVERY_ENABLED=true quando validações extras existirem.
  if (process.env.DOMAIN_DISCOVERY_ENABLED === "true") {
    try {
      const browser = await getBrowser();
      const discover = await discoverPagesForOffer(supa, offerId as string, {
        countries: ["BR"],
        minAdsPerPage: 2,
        browser,
      });
      if (discover.new_pages > 0) {
        console.log(
          `[enrich_from_url] ${uniqueSlug} · auto-discovered ${discover.new_pages} ad_library pages (UNVERIFIED, aguarda revisão do admin) via domain=${discover.domain}`
        );
      } else if (discover.skipped_reason) {
        console.log(
          `[enrich_from_url] ${uniqueSlug} · domain discovery skip: ${discover.skipped_reason}`
        );
      }
    } catch (err) {
      console.warn("[enrich_from_url] discover fail:", err);
    }
  }

  // 9. Sync criativos via API — baixa até 20 videos reais
  try {
    const browser = await getBrowser();
    const sync = await syncCreativesFromApi(supa, offerId as string, {
      countries: ["BR"],
      dispatchAlerts: false, // oferta nova, sem subscribers
      browser,
      offerSlug: uniqueSlug,
    });
    if (
      !sync.skipped &&
      (sync.videos_downloaded > 0 || sync.images_downloaded > 0)
    ) {
      console.log(
        `[enrich_from_url] ${uniqueSlug} · sync: +${sync.videos_downloaded}v +${sync.images_downloaded}i · api=${sync.api_total}`
      );
    }
  } catch (err) {
    console.warn("[enrich_from_url] sync creatives fail:", err);
  }

  // 10. AI authoring — enfileira job pra gerar sugestões de metadata
  // (structure, traffic, title, summary). Admin revisa via banner na edit page.
  // SÓ roda se:
  //   - feature está enabled em ai_suggest_config (admin pode desligar via UI)
  //   - tem transcript real (sem transcript, GPT não tem matéria prima)
  try {
    const { getAiSuggestConfigResolved } = await import("@/lib/queries/ai-suggest-config");
    const config = await getAiSuggestConfigResolved();
    if (!config.enabled) {
      console.log(
        `[enrich_from_url] ${uniqueSlug} · ai_authoring pulado (feature desabilitada pelo admin)`
      );
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: hasTranscript } = await (supa as any)
        .from("offers")
        .select("transcript_text")
        .eq("id", offerId as string)
        .maybeSingle<{ transcript_text: string | null }>();

      if (hasTranscript?.transcript_text && hasTranscript.transcript_text.length > 200) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supa.from("jobs") as any).insert({
          kind: "ai_authoring",
          payload: { offer_id: offerId },
          status: "pending",
          priority: 60,
        });
        console.log(
          `[enrich_from_url] ${uniqueSlug} · ai_authoring enfileirado (~$0.003)`
        );
      } else {
        console.log(
          `[enrich_from_url] ${uniqueSlug} · ai_authoring pulado (transcript ausente)`
        );
      }
    }
  } catch (err) {
    console.warn("[enrich_from_url] enqueue ai_authoring fail:", err);
  }
}

/**
 * Handler: enrich_offer
 * Roda worker numa oferta JÁ existente (usado pelo POST /enrich antigo).
 * Payload: { offer_id, url }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleEnrichOffer(supa: Supa, payload: any): Promise<void> {
  const { offer_id, url } = payload as { offer_id: string; url: string };
  if (!offer_id || !url) throw new Error("missing offer_id or url");

  const { data: offer } = await supa
    .from("offers")
    .select("slug")
    .eq("id", offer_id)
    .maybeSingle<{ slug: string }>();
  if (!offer) throw new Error("offer_not_found");

  const result = await enrichUrl(supa, offer_id, offer.slug, url);
  if (!result.ok) throw new Error(result.error ?? "enrichment_failed");

  // Auto-discover DESABILITADO por padrão (contaminação).
  // Ver comentário em handleEnrichFromUrl pra detalhes.
  if (process.env.DOMAIN_DISCOVERY_ENABLED === "true") {
    try {
      const browser = await getBrowser();
      const discover = await discoverPagesForOffer(supa, offer_id, {
        countries: ["BR"],
        minAdsPerPage: 2,
        browser,
      });
      if (discover.new_pages > 0) {
        console.log(
          `[enrich_offer] ${offer.slug} · auto-discovered ${discover.new_pages} new ad_library pages (UNVERIFIED) via domain=${discover.domain}`
        );
      }
    } catch (err) {
      console.warn("[enrich_offer] discover fail:", err);
    }
  }

  // Sync criativos via API — baixa até 20 videos + dispatch alerts
  try {
    const browser = await getBrowser();
    const sync = await syncCreativesFromApi(supa, offer_id, {
      countries: ["BR"],
      dispatchAlerts: true,
      browser,
      offerSlug: offer.slug,
    });
    if (
      !sync.skipped &&
      (sync.videos_downloaded > 0 || sync.images_downloaded > 0 || sync.stopped > 0)
    ) {
      console.log(
        `[enrich_offer] ${offer.slug} · sync: +${sync.videos_downloaded}v +${sync.images_downloaded}i · ${sync.stopped} stopped`
      );
    }
  } catch (err) {
    console.warn("[enrich_offer] sync creatives fail:", err);
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
