import { createClient } from "@/lib/supabase/server";

export type SparklinePoint = {
  date: string; // YYYY-MM-DD
  ad_count: number;
};

/**
 * Busca snapshots dos últimos 30 dias pra uma oferta e agrupa por dia.
 * Retorna array ordenado asc (oldest → newest). Se múltiplos snapshots
 * no mesmo dia, pega o último (max sampled_at).
 */
export async function getOfferSparkline30d(
  offerId: string
): Promise<SparklinePoint[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("offer_metrics")
    .select("ad_count, sampled_at")
    .eq("offer_id", offerId)
    .gte("sampled_at", since)
    .order("sampled_at", { ascending: true })
    .returns<{ ad_count: number; sampled_at: string }[]>();

  if (error || !data) return [];

  // Agrupa por dia (YYYY-MM-DD) pegando o último snapshot de cada dia
  const byDay = new Map<string, number>();
  for (const row of data) {
    const day = row.sampled_at.slice(0, 10);
    byDay.set(day, row.ad_count); // Sobrescreve — último insert wins (query é asc)
  }

  return [...byDay.entries()].map(([date, ad_count]) => ({ date, ad_count }));
}
