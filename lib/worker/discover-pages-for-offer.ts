/**
 * discover-pages-for-offer — helper reutilizável pra descobrir e cadastrar
 * Ad Library pages por domínio da oferta.
 *
 * Chamado em 3 pontos:
 *   1. handleEnrichFromUrl — após enrich inicial, descobre multi-Pages auto
 *   2. handleEnrichOffer   — quando admin re-enriquece oferta existente
 *   3. domainDiscoverySweep — varredura semanal de todas ofertas
 *   4. POST /api/admin/offers/[id]/discover-pages — trigger manual do admin
 *
 * Lógica:
 *   - Busca main_site (ou checkout fallback) URL da oferta
 *   - Extrai domínio normalizado (www. stripped, lowercase)
 *   - Chama fetchActiveAdsByDomain (API + Playwright fallback)
 *   - Pra cada page_id NOVO com ≥ threshold ads, insere row em pages
 *     type='ad_library' com meta_page_id + URL canônica
 *
 * Idempotente: se já existe row pra aquele meta_page_id na oferta, skip.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Browser } from "playwright";
import {
  fetchActiveAdsByDomain,
  extractSearchDomain,
  adLibraryPageUrl,
} from "./ad-library-domain-search";

type Supa = SupabaseClient<Database>;

export type DiscoverResult = {
  /** Tentou rodar? False se não tinha main_site URL */
  scanned: boolean;
  /** Quantas rows novas foram inseridas em pages */
  new_pages: number;
  /** Page IDs novos descobertos (antes do threshold filter) */
  discovered_page_ids: string[];
  /** Domínio usado na busca */
  domain: string | null;
  /** Total de ads ativos somados (do domain search) */
  total_ads: number | null;
  /** Origem: 'api' | 'scrape' | 'none' */
  source: "api" | "scrape" | "none";
  /** Motivo do skip se não rodou */
  skipped_reason?: string;
  /** Erro se houver */
  error?: string;
};

export async function discoverPagesForOffer(
  supa: Supa,
  offerId: string,
  options?: {
    countries?: string[];
    /** Mínimo de ads por page_id pra criar row (anti-spam/clones). Default 2 */
    minAdsPerPage?: number;
    /** Browser pra Playwright fallback. Se null, só API */
    browser?: Browser;
    /** Se true, loga cada passo (pra debug) */
    verbose?: boolean;
  }
): Promise<DiscoverResult> {
  const countries = options?.countries ?? ["BR"];
  const minAdsPerPage = options?.minAdsPerPage ?? 2;
  const log = (msg: string) => {
    if (options?.verbose) console.log(`[discover_pages ${offerId.slice(0, 8)}] ${msg}`);
  };

  // 0. Validação: oferta precisa ter VSL real extraída
  // Se não tem VSL, o main_site pode ser só checkout/redirect genérico
  // que não representa o advertiser. Skipamos por segurança.
  const { data: offer } = await supa
    .from("offers")
    .select("vsl_storage_path, slug")
    .eq("id", offerId)
    .maybeSingle<{ vsl_storage_path: string | null; slug: string }>();

  if (!offer) {
    return {
      scanned: false,
      new_pages: 0,
      discovered_page_ids: [],
      domain: null,
      total_ads: null,
      source: "none",
      skipped_reason: "offer_not_found",
    };
  }

  if (!offer.vsl_storage_path) {
    log(`skip: oferta ${offer.slug} sem VSL confirmada`);
    return {
      scanned: false,
      new_pages: 0,
      discovered_page_ids: [],
      domain: null,
      total_ads: null,
      source: "none",
      skipped_reason:
        "no_vsl_extracted: oferta precisa ter VSL real baixada pra validar que o domínio representa o advertiser",
    };
  }

  // 1. Busca TODAS as landing URLs da oferta (main_site + checkout)
  const { data: sitePages } = await supa
    .from("pages")
    .select("url, type, display_order")
    .eq("offer_id", offerId)
    .in("type", ["main_site", "checkout"])
    .order("display_order", { ascending: true })
    .returns<{ url: string; type: string; display_order: number | null }[]>();

  if (!sitePages || sitePages.length === 0) {
    return {
      scanned: false,
      new_pages: 0,
      discovered_page_ids: [],
      domain: null,
      total_ads: null,
      source: "none",
      skipped_reason: "no_main_site_or_checkout_url",
    };
  }

  // Prioriza main_site sobre checkout, e DOMÍNIOS ESPECÍFICOS sobre genéricos
  // (extractSearchDomain retorna null pra hotmart.com, instagram.com, etc)
  let domain: string | null = null;
  const triedDomains: string[] = [];
  // Ordena: main_site primeiro, depois checkout
  const ordered = [...sitePages].sort((a, b) =>
    a.type === "main_site" ? -1 : b.type === "main_site" ? 1 : 0
  );
  for (const p of ordered) {
    const d = extractSearchDomain(p.url);
    if (!d) continue; // genérico (blacklist) — pula
    domain = d;
    break;
  }
  // Só pra log: quais foram tentados
  for (const p of ordered) {
    try {
      const host = new URL(p.url).hostname
        .toLowerCase()
        .replace(/^www\./, "");
      triedDomains.push(host);
    } catch {}
  }

  if (!domain) {
    return {
      scanned: false,
      new_pages: 0,
      discovered_page_ids: [],
      domain: null,
      total_ads: null,
      source: "none",
      skipped_reason: `all_urls_generic_or_invalid: [${triedDomains.join(", ")}]`,
    };
  }

  log(`dominio escolhido=${domain} (tentados: ${triedDomains.join(",")})`);

  // 2. Chama domain search
  const searchResult = await fetchActiveAdsByDomain(
    domain,
    countries,
    options?.browser
  );

  if (searchResult.count === null) {
    return {
      scanned: true,
      new_pages: 0,
      discovered_page_ids: [],
      domain,
      total_ads: null,
      source: searchResult.source,
      error: searchResult.error ?? "search_returned_null",
    };
  }

  log(`total_ads=${searchResult.count} · page_ids=${searchResult.page_ids.join(",") || "nenhum"}`);

  // 3. Busca page_ids já cadastrados na oferta (dedup)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingRows } = await (supa as any)
    .from("pages")
    .select("meta_page_id, display_order")
    .eq("offer_id", offerId)
    .eq("type", "ad_library")
    .returns<{ meta_page_id: string | null; display_order: number | null }[]>();

  const existingSet = new Set(
    (existingRows ?? [])
      .map((r) => r.meta_page_id)
      .filter((id): id is string => !!id)
  );
  const maxOrder = Math.max(
    0,
    ...(existingRows ?? []).map((r) => r.display_order ?? 0)
  );

  // 4. Filtra page_ids novos que passam no threshold
  const candidates = searchResult.page_ids.filter(
    (pid) =>
      !existingSet.has(pid) &&
      (searchResult.count_by_page_id[pid] ?? 0) >= minAdsPerPage
  );

  if (candidates.length === 0) {
    log("nenhum page_id novo passou no threshold");
    return {
      scanned: true,
      new_pages: 0,
      discovered_page_ids: searchResult.page_ids,
      domain,
      total_ads: searchResult.count,
      source: searchResult.source,
    };
  }

  // 5. Insere rows novas — SEMPRE com verified_for_sync=false.
  // Admin precisa aprovar via UI antes que essas pages alimentem
  // sync-creatives-from-api. Sem isso, pages erradas (de outros
  // advertisers) contaminam o catálogo de criativos.
  const rowsToInsert = candidates.map((pid, idx) => ({
    offer_id: offerId,
    type: "ad_library",
    url: adLibraryPageUrl(pid, countries),
    title: `Ad Library · descoberta via ${domain}`,
    meta_page_id: pid,
    visible: true,
    display_order: maxOrder + 1 + idx,
    verified_for_sync: false, // ⚠️ aguarda revisão do admin
    discovered_via: "auto_domain_discovery",
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await (supa.from("pages") as any).insert(rowsToInsert);

  if (insErr) {
    return {
      scanned: true,
      new_pages: 0,
      discovered_page_ids: candidates,
      domain,
      total_ads: searchResult.count,
      source: searchResult.source,
      error: `insert_failed: ${insErr.message}`,
    };
  }

  log(`inseriu ${candidates.length} page_ids novos`);

  // 6. NÃO enfileira sync automático — pages novas estão unverified.
  // refresh_ad_count ainda pode ser enfileirado pois só lê contagem
  // agregada; admin decide se as pages realmente contam pra oferta.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa.from("jobs") as any).insert({
    kind: "refresh_ad_count",
    payload: { offer_id: offerId },
    status: "pending",
    priority: 90,
  });

  return {
    scanned: true,
    new_pages: candidates.length,
    discovered_page_ids: candidates,
    domain,
    total_ads: searchResult.count,
    source: searchResult.source,
  };
}
