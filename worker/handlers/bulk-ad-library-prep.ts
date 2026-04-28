import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { runBulkAdLibraryPrep } from "@/lib/worker/bulk-ad-library-prep";

type Supa = SupabaseClient<Database>;

/**
 * Handler: bulk_ad_library_prep
 *
 * Payload: { offer_id, url, country? }
 *
 * Leve. Só faz Meta API + cria pages + enfileira enrich_from_url da
 * landing descoberta. Concurrency 5, timeout 30s.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleBulkAdLibraryPrep(supa: Supa, payload: any): Promise<void> {
  const { offer_id, url, country } = payload as {
    offer_id: string;
    url: string;
    country?: string;
  };
  if (!offer_id) throw new Error("missing_offer_id");
  if (!url) throw new Error("missing_url");

  const res = await runBulkAdLibraryPrep(supa, {
    offerId: offer_id,
    originalUrl: url,
    country: country ?? "BR",
  });

  if (res.ok) {
    console.log(
      `[bulk_ad_library_prep] offer=${offer_id.slice(0, 8)} page_id=${res.meta_page_id} landing=${res.landing_discovered ? "DISCOVERED" : "fallback"} ads=${res.ad_count_preview}${res.landing_url ? ` → ${res.landing_url.slice(0, 60)}` : ""}`
    );
  } else {
    console.warn(
      `[bulk_ad_library_prep] offer=${offer_id.slice(0, 8)} ${res.error}`
    );
  }
}
