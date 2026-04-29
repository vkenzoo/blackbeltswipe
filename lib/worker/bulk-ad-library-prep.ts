/**
 * Bulk Ad Library Prep — handler rápido que prepara uma oferta
 * vinda de bulk import de URL do Ad Library.
 *
 * FLUXO:
 *   1. Parse da URL → extrai meta_page_id (view_all_page_id)
 *   2. Cria `pages` row do tipo ad_library (verified_for_sync=true, bulk trust)
 *   3. Meta API /ads_archive pra essa page → pega 1º ad ativo
 *   4. Extrai link_url da landing real desse ad
 *   5. Enfileira `enrich_from_url` pra landing real (que tenta achar VSL)
 *      - Se landing tem VSL → enrich baixa, transcribe, AI draft
 *      - Se landing não tem VSL → enrich só tira screenshot, oferta
 *        fica marcada pra admin revisar manual (comportamento atual do enrich)
 *
 * Porque isso é rápido:
 *   - Meta API é ~500ms por call
 *   - Worker tem concurrency 5 pra esse kind
 *   - 10 URLs processam em paralelo = ~5s pra todas chegarem no enrich
 *
 * FALLBACK: se URL não parseia como Ad Library OU Meta API falha OU sem ads
 * ativos, enfileira enrich_from_url da URL original (comportamento antigo).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { fetchActiveAdsByPage, fetchActiveAdsBySearchTerms } from "@/lib/worker/ad-library-api";
import { adLibraryPageUrl } from "@/lib/worker/ad-library-domain-search";
import { isLandingCandidateUrl, isCheckoutUrl } from "@/lib/security";

type Supa = SupabaseClient<Database>;

export type BulkPrepResult =
  | {
      ok: true;
      meta_page_id: string;
      landing_url: string | null;
      ad_count_preview: number;
      /** True se a landing_url é diferente da URL original */
      landing_discovered: boolean;
    }
  | { ok: false; error: string };

/**
 * Extrai view_all_page_id de URL do Ad Library.
 *
 * Aceita formatos:
 *   - https://facebook.com/ads/library/?view_all_page_id=123
 *   - https://www.facebook.com/ads/library/?view_all_page_id=123&...
 *   - https://facebook.com/ads/library/?...&view_all_page_id=123
 *
 * Retorna null se URL não é Ad Library ou não tem page_id.
 */
export function extractAdLibraryPageId(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    if (!/facebook\.com$/i.test(u.hostname) && !/^www\.facebook\.com$/i.test(u.hostname)) {
      return null;
    }
    if (!u.pathname.startsWith("/ads/library")) return null;
    const id = u.searchParams.get("view_all_page_id");
    if (!id || !/^\d+$/.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}

/**
 * Multi-country default usado quando URL do Ad Library tem `country=ALL`
 * ou quando admin cola URL sem indicar país.
 *
 * Lista ampla cobrindo ~todos mercados ocidentais relevantes — inclui
 * países que historicamente perdíamos (DE, FR, IT, NL, etc). Custo extra:
 * zero (Meta API aceita o array inteiro em 1 call).
 *
 * Por que não "world":  Meta API aceita até ~50 country codes mas a
 * matemática de ad_reached_countries é OR (ad reached qualquer um deles),
 * então a lista só precisa cobrir os países onde esperamos rodadas reais.
 */
const ALL_COUNTRIES_DEFAULT = [
  // Português
  "BR", "PT",
  // Anglosfera
  "US", "GB", "CA", "AU", "IE", "NZ",
  // Espanhol
  "ES", "MX", "AR", "CO", "CL", "PE", "VE", "UY", "PY", "BO", "EC",
  // Europa Ocidental (não-anglo)
  "FR", "DE", "IT", "NL", "BE", "CH", "AT", "SE", "NO", "DK", "FI",
  // Outros mercados grandes
  "JP", "KR", "IN", "ID", "PH", "TH", "MY", "SG", "TR", "ZA", "AE", "SA",
];

/**
 * Core do handler.
 */
export async function runBulkAdLibraryPrep(
  supa: Supa,
  opts: {
    offerId: string;
    originalUrl: string;
    /** Lista de países pra Meta API. Default: multi-país global. */
    countries?: string[];
    /** Compat: payloads antigos com country: string single. */
    country?: string;
  }
): Promise<BulkPrepResult> {
  // Resolve countries: prefere array novo, senão converte single, senão multi default
  const countries: string[] =
    opts.countries && opts.countries.length > 0
      ? opts.countries
      : opts.country && opts.country !== "ALL"
        ? [opts.country]
        : ALL_COUNTRIES_DEFAULT;

  // 1. Extrai page_id da URL
  const metaPageId = extractAdLibraryPageId(opts.originalUrl);
  if (!metaPageId) {
    // Fallback — URL não é Ad Library. Enfileira enrich direto.
    await enqueueEnrichFallback(supa, opts.offerId, opts.originalUrl);
    return {
      ok: false,
      error: "not_ad_library_url_fallback_enqueued",
    };
  }

  // 2. Cria page ad_library verified (bulk = trust direto, admin cadastrou)
  //    Primeiro checa se já existe (idempotente)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supa as any)
    .from("pages")
    .select("id")
    .eq("offer_id", opts.offerId)
    .eq("type", "ad_library")
    .eq("meta_page_id", metaPageId)
    .maybeSingle();

  if (!existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("pages") as any).insert({
      offer_id: opts.offerId,
      type: "ad_library",
      url: adLibraryPageUrl(metaPageId, countries),
      title: `Ad Library · page ${metaPageId}`,
      meta_page_id: metaPageId,
      visible: true,
      display_order: 0,
      verified_for_sync: true, // bulk confia no admin
      discovered_via: "bulk_ad_library_prep",
    });
  }

  // 3. Meta API pra pegar ads ativos da page (multi-country em 1 call)
  const result = await fetchActiveAdsByPage(
    metaPageId,
    countries,
    undefined,
    25, // pega até 25 pra ter chance maior de achar 1 com landing válida
    { caller_handler: "bulk_ad_library_prep", offer_id: opts.offerId }
  );

  // 3b. Fallback: search_page_ids estrito perde ads atribuídos a sub-pages
  //     do mesmo advertiser. Se retornou < 5 ads, retenta via search_terms
  //     com o page_name (mais permissivo, agrega ads de páginas relacionadas).
  //     Merge resultados por ad.id pra evitar duplicação.
  if (
    !result.blocked &&
    result.ads &&
    result.ads.length < 5 &&
    result.ads.length > 0
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstAd = result.ads[0] as any;
    const pageName: string | undefined =
      firstAd.page_name ??
      firstAd.snapshot?.page_name ??
      firstAd.snapshot?.byline;
    if (pageName) {
      const fallback = await fetchActiveAdsBySearchTerms(
        pageName,
        countries,
        undefined,
        50,
        {
          caller_handler: "bulk_ad_library_prep_fallback",
          offer_id: opts.offerId,
        }
      );
      if (!fallback.blocked && fallback.ads && fallback.ads.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const seen = new Set((result.ads as any[]).map((a) => a.id));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const ad of fallback.ads as any[]) {
          // Filtra: só ads desse mesmo page_id (evita pegar advertiser homônimo)
          if (ad.page_id === metaPageId && !seen.has(ad.id)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (result.ads as any[]).push(ad);
            seen.add(ad.id);
          }
        }
        result.count = result.ads.length;
        console.log(
          `[bulk_ad_library_prep] fallback search_terms="${pageName.slice(0, 30)}" → +${result.ads.length - 1} ads (total=${result.ads.length})`
        );
      }
    }
  }

  if (result.blocked || !result.ads || result.ads.length === 0) {
    // Sem ads ativos (conta pausou tudo) — enfileira enrich da URL original
    // como último recurso (pode ser landing direta).
    await enqueueEnrichFallback(supa, opts.offerId, opts.originalUrl);
    return {
      ok: true,
      meta_page_id: metaPageId,
      landing_url: null,
      ad_count_preview: 0,
      landing_discovered: false,
    };
  }

  // 4. Extrai link_url dos ads — pega o 1º que for LANDING VÁLIDA.
  //    Regras de exclusão (aplica em ordem):
  //    - Checkout (pay.hotmart, kiwify, eduzz, etc) — nunca tem VSL
  //    - Redirects/social (l.facebook.com, bit.ly, t.co)
  //    - Facebook direct (ads apontando pra page FB mesmo)
  //    Se nenhum ad tem landing válida, salva checkout candidate como
  //    pagina tipo 'checkout' (valor pro admin) e retorna sem VSL.
  let landingUrl: string | null = null;
  let fallbackCheckoutUrl: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ad of result.ads as any[]) {
    // Tenta múltiplos paths onde a Meta pode expor o link
    const candidates = [
      ad.snapshot?.link_url,
      ad.link_url,
      ad.snapshot?.cards?.[0]?.link_url,
      ad.snapshot?.body?.link_url,
    ].filter((u): u is string => typeof u === "string" && u.length > 0);

    for (const c of candidates) {
      // URL válida?
      try {
        new URL(c);
      } catch {
        continue;
      }

      // Landing boa pra extração de VSL?
      if (isLandingCandidateUrl(c)) {
        landingUrl = c;
        break;
      }

      // Guarda 1º checkout como fallback — admin pode querer ver isso
      // mas NÃO enfileira enrich pra checkout.
      if (!fallbackCheckoutUrl && isCheckoutUrl(c)) {
        fallbackCheckoutUrl = c;
      }
    }
    if (landingUrl) break;
  }

  // 5. Registra checkout como page se achou (pro admin ver o destino real)
  if (fallbackCheckoutUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa.from("pages") as any).insert({
        offer_id: opts.offerId,
        type: "checkout",
        url: fallbackCheckoutUrl,
        title: "Checkout · detectado via Meta API",
        visible: true,
        display_order: 10,
        verified_for_sync: true,
        discovered_via: "bulk_ad_library_prep_checkout",
      });
    } catch {
      /* ignora — pode já existir */
    }
  }

  // 6. Enfileira enrich:
  //    - Se achou landing válida via fields da API → enrich nessa landing direta
  //    - Senão → enrich na URL original do Ad Library (Playwright vai abrir
  //      o snapshot, scrape os ads e descobrir landings/VSLs por DOM)
  //
  //    Por que SEMPRE enfileirar enrich (mesmo sem landing):
  //    Meta API NÃO retorna link_url nos fields públicos. URL de destino só
  //    existe no HTML renderizado pelo ad_snapshot_url. Playwright (via
  //    enrich_from_url) scrapeia esse HTML e descobre landings reais — esse
  //    caminho já funciona pra URLs keyword (Vivendo de iPhone, 56 landings).
  if (landingUrl) {
    await enqueueEnrichFallback(supa, opts.offerId, landingUrl);
  } else {
    console.log(
      `[bulk_ad_library_prep] offer=${opts.offerId.slice(0, 8)} SEM landing nos fields da API — fallback Playwright na URL Ad Library`
    );
    await enqueueEnrichFallback(supa, opts.offerId, opts.originalUrl);
  }

  return {
    ok: true,
    meta_page_id: metaPageId,
    landing_url: landingUrl,
    ad_count_preview: result.count ?? result.ads.length,
    landing_discovered: landingUrl !== null,
  };
}

async function enqueueEnrichFallback(
  supa: Supa,
  offerId: string,
  url: string
): Promise<void> {
  // Dedup: se já existe enrich_from_url pending/running pra essa oferta
  // (ex: prep retry após falha transitória), não enfileira duplicado.
  // Evita worker processar 2× a mesma oferta criando pages/creatives dupes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supa as any)
    .from("jobs")
    .select("id")
    .eq("kind", "enrich_from_url")
    .in("status", ["pending", "running"])
    .filter("payload->>job_offer_id", "eq", offerId)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(
      `[bulk_ad_library_prep] dedup: enrich_from_url já existe pra offer=${offerId.slice(0, 8)}`
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa.from("jobs") as any).insert({
    kind: "enrich_from_url",
    payload: {
      url,
      job_offer_id: offerId,
      source: "bulk_ad_library_prep_enqueued",
    },
    status: "pending",
    priority: 75,
  });
}
