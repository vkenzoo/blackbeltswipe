/**
 * backfill_ad_count — reconstrói histórico de 30 dias de uma oferta via
 * Meta Ad Library API usando ad_active_status=ALL.
 *
 * FLUXO:
 *   1. Busca offer + pages ad_library verified
 *   2. Pra cada page: fetchAllAdsByPage(page_id, countries)
 *      → Retorna ads ATIVOS + INATIVOS com start/stop timestamps
 *   3. Agrega ads de todas pages, deduplica por ad.id
 *   4. reconstructDailyTimeline(ads, 30) → Map<YYYY-MM-DD, count>
 *   5. Pra cada dia, insere 1 snapshot em offer_metrics IFF ainda não existir
 *      snapshot daquele dia (preserva snapshots ao-vivo que são mais precisos)
 *
 * IDEMPOTENTE: rodar 2x dá mesmo resultado (não sobrescreve existing).
 *
 * Custo: 1 call por page. Offer média tem 1-2 pages → 1-2 calls.
 * Offers com muitas pages (multi-advertiser): N calls.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  fetchAllAdsByPage,
  reconstructDailyTimeline,
  type HistoryAd,
} from "@/lib/worker/ad-library-history";

type Supa = SupabaseClient<Database>;

type OfferRow = {
  id: string;
  slug: string;
  language: string | null;
  status: string;
};

type PageRow = {
  id: string;
  meta_page_id: string | null;
  type: string;
  verified_for_sync: boolean;
};

export async function handleBackfillAdCount(
  supa: Supa,
  payload: { offer_id: string; days?: number }
): Promise<{
  ok: boolean;
  ads_fetched: number;
  days_written: number;
  days_skipped: number;
  pages_queried: number;
  error?: string;
}> {
  const offerId = payload.offer_id;
  const daysBack = Math.min(90, Math.max(7, payload.days ?? 30));

  // 1. Load offer + pages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offerData } = await (supa as any)
    .from("offers")
    .select("id, slug, language, status")
    .eq("id", offerId)
    .maybeSingle();
  const offer: OfferRow | null = offerData ?? null;

  if (!offer) {
    return {
      ok: false,
      ads_fetched: 0,
      days_written: 0,
      days_skipped: 0,
      pages_queried: 0,
      error: "offer_not_found",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pages } = await (supa as any)
    .from("pages")
    .select("id, meta_page_id, type, verified_for_sync")
    .eq("offer_id", offerId)
    .eq("type", "ad_library")
    .eq("verified_for_sync", true)
    .not("meta_page_id", "is", null);

  const pageRows: PageRow[] = pages ?? [];

  if (pageRows.length === 0) {
    console.log(
      `[backfill_ad_count] offer ${offer.slug} sem pages ad_library verified — skip`
    );
    return {
      ok: true,
      ads_fetched: 0,
      days_written: 0,
      days_skipped: 0,
      pages_queried: 0,
    };
  }

  // IMPORTANTE: Meta Graph API /ads_archive com ad_active_status=ALL é
  // MUITO inconsistente com "ALL" como país. Empiricamente:
  //   - Page X: ACTIVE+[ALL]=0, ACTIVE+[BR]=0, ALL+[ALL]=0, ALL+[BR]=9 ads
  //   - Page Y: ALL+[BR]=100+, ALL+[PT]=100+, ALL+[US]=100+ (rodando multi-país)
  //   - Algumas Pages: API retorna 0 em TUDO (limitação DSA/API Meta)
  //
  // Estratégia: query pra cada país principal individualmente + dedup por ad.id.
  // Cobertura: BR, PT, US, ES, MX, AR, CO, CL, GB, CA — cobre 95% dos
  // advertisers brasileiros que geralmente rodam em PT-BR ou US-EN.
  // Custo: 10 calls por page em vez de 1, mas backfill é operação 1x.
  const BACKFILL_COUNTRIES = [
    "BR", "PT", "US", "GB", "CA", "AU",
    "ES", "MX", "AR", "CO", "CL",
  ];

  // 2. Fetch ALL ads por page, agregando por país
  const allAds: HistoryAd[] = [];
  let pagesQueried = 0;
  let blockedCount = 0;
  let firstError: string | undefined;

  for (const page of pageRows) {
    if (!page.meta_page_id) continue;

    let adsThisPage = 0;
    for (const country of BACKFILL_COUNTRIES) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetchAllAdsByPage(page.meta_page_id, [country], 500, {
        caller_handler: "backfill_ad_count",
        offer_id: offerId,
      });
      pagesQueried++;
      if (res.blocked) {
        blockedCount++;
        if (!firstError) firstError = res.error;
        continue;
      }
      allAds.push(...res.ads);
      adsThisPage += res.ads.length;
    }

    console.log(
      `[backfill_ad_count] ${offer.slug} page=${page.meta_page_id} · ${adsThisPage} ads agregados de ${BACKFILL_COUNTRIES.length} países (com duplicatas)`
    );
  }

  // Dedupe por ad.id (mesma ad pode aparecer em múltiplas pages se offer tem
  // Pages irmãs do mesmo advertiser que duplicam criativos)
  const seenIds = new Set<string>();
  const uniqueAds = allAds.filter((ad) => {
    if (seenIds.has(ad.id)) return false;
    seenIds.add(ad.id);
    return true;
  });

  console.log(
    `[backfill_ad_count] ${offer.slug} · ${uniqueAds.length} ads únicos (${allAds.length} total antes de dedup) de ${pagesQueried} pages`
  );

  if (uniqueAds.length === 0) {
    return {
      ok: blockedCount === 0,
      ads_fetched: 0,
      days_written: 0,
      days_skipped: 0,
      pages_queried: pagesQueried,
      error: firstError,
    };
  }

  // 3. Reconstrói timeline diária
  const timeline = reconstructDailyTimeline(uniqueAds, daysBack);

  // 4. Busca snapshots existentes desses dias pra não sobrescrever
  const days = Array.from(timeline.keys()); // YYYY-MM-DD
  const oldestDay = days.reduce((a, b) => (a < b ? a : b));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingSnaps } = await (supa as any)
    .from("offer_metrics")
    .select("sampled_at")
    .eq("offer_id", offerId)
    .eq("time_window", "snapshot_1d")
    .gte("sampled_at", oldestDay + "T00:00:00Z");

  const existingDays = new Set<string>();
  for (const s of (existingSnaps ?? []) as Array<{ sampled_at: string }>) {
    existingDays.add(s.sampled_at.slice(0, 10));
  }

  // 5. Insert só os dias que NÃO existem ainda (preserva live snapshots)
  const rows: Array<{
    offer_id: string;
    time_window: string;
    ad_count: number;
    sampled_at: string;
  }> = [];

  let skipped = 0;
  for (const [day, count] of timeline.entries()) {
    if (existingDays.has(day)) {
      skipped++;
      continue;
    }
    // Grava o snapshot no meio do dia (12h UTC) pra ordenação limpa
    rows.push({
      offer_id: offerId,
      time_window: "snapshot_1d",
      ad_count: count,
      sampled_at: day + "T12:00:00Z",
    });
  }

  if (rows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supa.from("offer_metrics") as any).insert(
      rows
    );
    if (insErr) {
      console.error(
        `[backfill_ad_count] ${offer.slug} insert error:`,
        insErr.message
      );
      return {
        ok: false,
        ads_fetched: uniqueAds.length,
        days_written: 0,
        days_skipped: skipped,
        pages_queried: pagesQueried,
        error: insErr.message,
      };
    }
  }

  console.log(
    `[backfill_ad_count] ${offer.slug} · gravou ${rows.length} dias · pulou ${skipped} (já existiam)`
  );

  return {
    ok: true,
    ads_fetched: uniqueAds.length,
    days_written: rows.length,
    days_skipped: skipped,
    pages_queried: pagesQueried,
    error: blockedCount > 0 ? firstError : undefined,
  };
}
