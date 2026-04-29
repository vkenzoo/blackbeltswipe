import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { syncCreativesFromApi } from "@/lib/worker/sync-creatives-from-api";
import { countriesForOfferLanguage } from "@/lib/worker/offer-countries";
import { getBrowser } from "../shared-browser";

type Supa = SupabaseClient<Database>;

/**
 * Handler: sync_creatives
 *
 * Payload: { offer_id: string }
 *
 * Baixa criativos (vídeos + imagens) da Meta API pras pages ad_library
 * já verificadas da oferta. Idempotente via meta_ad_id unique.
 *
 * Enfileirado em 2 lugares:
 *   - /api/admin/pages/[id]/verify (admin marca page como verified)
 *   - /api/admin/offers/bulk-status (parte do pipeline bulk import)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleSyncCreatives(supa: Supa, payload: any): Promise<void> {
  const { offer_id } = payload as { offer_id: string };
  if (!offer_id) throw new Error("missing_offer_id");

  // Lê language da oferta pra escolher países corretos (multi-país por idioma)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offer } = await (supa as any)
    .from("offers")
    .select("language, slug")
    .eq("id", offer_id)
    .maybeSingle();

  const countries = countriesForOfferLanguage(offer?.language);
  const browser = await getBrowser();

  const res = await syncCreativesFromApi(supa, offer_id, {
    countries,
    browser,
    offerSlug: offer?.slug,
  });

  if (res.skipped) {
    console.log(
      `[sync_creatives] offer=${offer_id.slice(0, 8)} SKIPPED reason=${res.skip_reason}`
    );
    return;
  }

  console.log(
    `[sync_creatives] offer=${offer_id.slice(0, 8)} api_total=${res.api_total} videos=${res.videos_downloaded} images=${res.images_downloaded} skipped=${res.media_skipped} failed=${res.download_failed} new=${res.new_ad_ids.length}`
  );

  if (res.errors.length > 0) {
    console.warn(
      `[sync_creatives] offer=${offer_id.slice(0, 8)} errors=${res.errors.slice(0, 3).join("; ")}`
    );
  }
}
