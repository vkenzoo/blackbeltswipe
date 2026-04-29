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
import { fetchActiveAdsByPage } from "@/lib/worker/ad-library-api";
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
 * ou quando admin cola URL sem indicar país. Cobre BR + Portugal + anglosfera
 * + LATAM. Custo extra: nenhum (Meta API aceita array de countries em 1 call).
 */
const ALL_COUNTRIES_DEFAULT = [
  "BR", "PT",                          // Português
  "US", "GB", "CA", "AU",              // Inglês
  "ES", "MX", "AR", "CO", "CL",        // Espanhol
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
    5, // só 5 pra economizar — só precisamos de 1 com link
    { caller_handler: "bulk_ad_library_prep", offer_id: opts.offerId }
  );

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

  // 6. Enfileira enrich APENAS se achou landing válida (não checkout).
  //    Se todos os ads vão direto pro checkout, oferta fica com:
  //    - ad_library page (verified)
  //    - checkout page (se tinha)
  //    - creatives do Ad Library (via sync posterior)
  //    - Admin vê "Sem VSL" e decide se vale a oferta
  if (landingUrl) {
    await enqueueEnrichFallback(supa, opts.offerId, landingUrl);
  } else {
    console.log(
      `[bulk_ad_library_prep] offer=${opts.offerId.slice(0, 8)} SEM landing válida (todos ads vão pra checkout/redirect) — pulando enrich`
    );
    // Atualiza title da oferta pra sinalizar ao admin que o pipeline terminou
    // sem VSL. Evita oferta ficar com title genérico "Extraindo..." pra sempre.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa.from("offers") as any)
        .update({
          title: "Ad Library · sem VSL (só checkout)",
        })
        .eq("id", opts.offerId)
        .eq("title", "Extraindo..."); // só atualiza se ainda é placeholder
    } catch {
      /* silent */
    }
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
