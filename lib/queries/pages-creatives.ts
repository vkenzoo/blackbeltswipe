import { createClient } from "@/lib/supabase/server";
import type { Page, Creative } from "@/lib/types";

/**
 * Retorna as pages públicas (visible=true) de uma oferta, ordenadas.
 * Se não houver nenhuma cadastrada, retorna array vazio (UI renderiza empty state).
 */
export async function getOfferPagesPublic(offerId: string): Promise<Page[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pages")
    .select("id, offer_id, type, url, title, screenshot_url, fetched_at, visible, display_order")
    .eq("offer_id", offerId)
    .eq("visible", true)
    .order("display_order")
    .returns<Page[]>();

  if (error) {
    console.error("getOfferPagesPublic error:", error);
    return [];
  }
  return data ?? [];
}

/**
 * Retorna os criativos públicos (visible=true) de uma oferta, ordenados.
 */
export async function getOfferCreativesPublic(offerId: string): Promise<Creative[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creatives")
    .select("id, offer_id, kind, asset_url, thumbnail_url, duration_seconds, captured_at, caption, published_at, visible, display_order, transcript_text, transcribed_at")
    .eq("offer_id", offerId)
    .eq("visible", true)
    .order("display_order")
    .order("captured_at", { ascending: false })
    .returns<Creative[]>();

  if (error) {
    console.error("getOfferCreativesPublic error:", error);
    return [];
  }
  return data ?? [];
}
