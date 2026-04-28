import { createClient } from "@/lib/supabase/server";
import type { Offer } from "@/lib/types";

/**
 * Lista todas as ofertas visíveis pro user atual.
 * RLS filtra: user comum só vê active, admin vê tudo.
 */
export async function listOffers(): Promise<Offer[]> {
  const supabase = await createClient();
  // Ordena por scale_score DESC (primário) + ad_count DESC (fallback pra
  // ofertas ainda sem score calculado). Migration spy_engine já rodou.
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .order("scale_score", { ascending: false, nullsFirst: false })
    .order("ad_count", { ascending: false })
    .returns<Offer[]>();

  if (error) {
    console.error("listOffers error:", error);
    return [];
  }
  return data ?? [];
}

/**
 * Busca uma oferta pelo slug.
 * Retorna null se não existe ou se user não tem acesso (RLS).
 */
export async function getOfferBySlug(slug: string): Promise<Offer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Offer>();

  if (error) {
    console.error("getOfferBySlug error:", error);
    return null;
  }
  return data;
}

/**
 * Admin: lista tudo incluindo drafts e paused.
 */
export async function listAllOffersAdmin(): Promise<Offer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Offer[]>();

  if (error) {
    console.error("listAllOffersAdmin error:", error);
    return [];
  }
  return data ?? [];
}
