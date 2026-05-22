/**
 * Cap único de creatives por oferta + utilities pra dedup.
 *
 * Política: máximo 30 criativos por oferta (qualquer combinação de video
 * + image). Aplicada em 3 caminhos:
 *   1. Sync via Meta API (sync-creatives-from-api.ts)
 *   2. Playwright enrich (lib/worker/enrich.ts)
 *   3. Upload manual via UI (POST /admin/offers/[id]/creatives)
 *
 * Dedup garantido por:
 *   - meta_ad_id unique (já existente, dedupa ads do FB)
 *   - (offer_id, asset_url) unique (nova migration, dedupa em qualquer path)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

export const MAX_CREATIVES_PER_OFFER = 30;

export type CreativeCapStatus = {
  current: number;
  remaining: number;
  atCap: boolean;
};

/**
 * Conta quantos criativos a oferta tem atualmente e quantos slots restam
 * até o cap de 30.
 */
export async function getCreativeCapStatus(
  supa: Supa,
  offerId: string
): Promise<CreativeCapStatus> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supa as any)
    .from("creatives")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", offerId);
  const current = count ?? 0;
  const remaining = Math.max(0, MAX_CREATIVES_PER_OFFER - current);
  return { current, remaining, atCap: current >= MAX_CREATIVES_PER_OFFER };
}

/**
 * Checa se um asset_url específico já existe pra essa oferta.
 * Usado por upload manual + Playwright pra evitar re-insert do mesmo path.
 */
export async function assetUrlExists(
  supa: Supa,
  offerId: string,
  assetUrl: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supa as any)
    .from("creatives")
    .select("id")
    .eq("offer_id", offerId)
    .eq("asset_url", assetUrl)
    .limit(1)
    .maybeSingle();
  return !!data;
}
