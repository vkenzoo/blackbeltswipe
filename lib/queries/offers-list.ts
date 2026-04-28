import { createClient } from "@/lib/supabase/server";
import type { Offer } from "@/lib/types";

/**
 * Lista ofertas com paginação / limite.
 * Ordena por scale_score DESC > ad_count DESC.
 *
 * RLS garante visibilidade: user comum só enxerga active, admin vê tudo.
 *
 * @param opts.limit    Quantidade por página (default 120, max 500)
 * @param opts.offset   Offset pra paginar (default 0)
 * @param opts.adminAll Quando true, ignora ordenação de score e ordena por
 *                      created_at DESC (mais recentes primeiro — útil no admin)
 */
export async function listOffersPaginated(opts?: {
  limit?: number;
  offset?: number;
  adminAll?: boolean;
}): Promise<{ offers: Offer[]; total: number; has_more: boolean }> {
  const limit = Math.min(Math.max(opts?.limit ?? 120, 1), 500);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const adminAll = opts?.adminAll ?? false;

  const supabase = await createClient();

  // Query base — head:false + count:'exact' faz Supabase retornar contagem total
  let q = supabase
    .from("offers")
    .select("*", { count: "exact" })
    .range(offset, offset + limit - 1);

  q = adminAll
    ? q.order("created_at", { ascending: false })
    : q
        .order("scale_score", { ascending: false, nullsFirst: false })
        .order("ad_count", { ascending: false });

  const { data, error, count } = await q.returns<Offer[]>();

  if (error) {
    console.error("listOffersPaginated error:", error);
    return { offers: [], total: 0, has_more: false };
  }

  const total = count ?? 0;
  const offers = data ?? [];
  return {
    offers,
    total,
    has_more: offset + offers.length < total,
  };
}
