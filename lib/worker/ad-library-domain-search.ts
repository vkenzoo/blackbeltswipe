/**
 * ad-library-domain-search — Layer 3 da cascata de refresh_ad_count.
 *
 * Busca ads ativos por domínio/keyword (em vez de page_id), agregando
 * resultados de MÚLTIPLAS Pages do mesmo advertiser. Usa 2 estratégias:
 *
 * 1) API oficial com `search_terms` (mais rápido, quando token tá OK)
 * 2) Playwright scrape do Ad Library UI (fallback quando API bloqueia)
 *
 * Output padronizado: { count, page_ids[], count_by_page_id{}, source }
 *
 * Casos cobertos:
 *   - Page rotation (advertiser mudou Page, antiga zerou)
 *   - Multi-Page advertiser (Paulo Borges roda 2+ Pages simultâneas)
 *   - Novas descobertas passivas via discovery sweep semanal
 */

import type { Browser } from "playwright";
import {
  fetchActiveAdsBySearchTerms,
  isApiEnabled,
  type AdCountResult,
  type ApiCallContext,
} from "./ad-library-api";
import { parseAdCountFromText, countAdCardsFromDom } from "./ad-count-extractor";

export type DomainSearchResult = {
  /** Total de ads ativos agregados across all pages */
  count: number | null;
  /** Page IDs únicos que apareceram nos resultados */
  page_ids: string[];
  /** Contagem por page_id (pra threshold de spam / ranking) */
  count_by_page_id: Record<string, number>;
  /** Origem do dado: 'api' | 'scrape' | 'none' */
  source: "api" | "scrape" | "none";
  /** Erro se houver */
  error?: string;
};

/**
 * BLACKLIST — domínios genéricos (checkouts, builders, redes sociais) que
 * NÃO representam um advertiser específico.
 *
 * Se rodar domain search nesses, retorna ads de milhares de advertisers
 * diferentes (todos que usam Hotmart/Kiwify/etc). Causa contaminação séria.
 *
 * Match via endsWith pra pegar variações tipo pay.hotmart.com, checkout.hotmart.com.
 */
const DOMAIN_BLACKLIST = [
  // Checkout processors
  "hotmart.com",
  "kiwify.com",
  "kiwify.com.br",
  "kiwify.app",
  "eduzz.com",
  "kirvano.com",
  "perfectpay.com.br",
  "monetizze.com.br",
  "pagseguro.com.br",
  "mercadopago.com",
  "ticto.com.br",
  "pepper.com.br",
  "braip.com",
  "sunize.com.br",

  // Funnel builders / LP hosts
  "funnelinfinito.online",
  "builderall.com",
  "clickfunnels.com",
  "leadlovers.com",
  "go.hotmart.com",
  "webinarjam.com",
  "converteai.net",
  "vturb.com.br",
  "panda-vid.com",

  // Redes sociais
  "instagram.com",
  "facebook.com",
  "fb.me",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "threads.net",
  "linkedin.com",

  // URL shorteners
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "lnkd.in",

  // CDNs e assets
  "amazonaws.com",
  "cloudfront.net",
  "cloudflare.com",
];

/**
 * Verifica se um domínio normalizado é genérico (checkout, builder, rede social).
 */
export function isGenericDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return DOMAIN_BLACKLIST.some(
    (bl) => d === bl || d.endsWith("." + bl)
  );
}

/**
 * Normaliza URL de landing pra domínio pesquisável.
 *
 * Ex: "https://www.techpauloborges.com/vsl?q=1" → "techpauloborges.com"
 *
 * Retorna null pra domínios na blacklist (previne contaminação por domínios
 * genéricos como hotmart, instagram, etc).
 */
export function extractSearchDomain(url: string): string | null {
  try {
    const u = new URL(url);
    const domain = u.hostname.toLowerCase().replace(/^www\./, "");
    if (isGenericDomain(domain)) return null;
    return domain;
  } catch {
    return null;
  }
}

/**
 * Monta a URL pública da Ad Library pra busca por domínio.
 * Formato: search_type=keyword_exact_phrase com domínio em aspas.
 */
export function adLibraryDomainSearchUrl(
  domain: string,
  countries: string[] = ["BR"]
): string {
  const country = countries[0] ?? "BR";
  const q = `"${domain}"`;
  return (
    `https://www.facebook.com/ads/library/` +
    `?active_status=active&ad_type=all&country=${country}` +
    `&search_type=keyword_exact_phrase&q=${encodeURIComponent(q)}`
  );
}

/**
 * Monta URL canônica de uma Page no Ad Library (pra salvar em pages.url
 * quando descobrimos um page_id novo via domain search).
 *
 * IMPORTANTE: default é `country=ALL` (agregado global) porque:
 *   1. Advertisers brasileiros rodam ads em múltiplos países (ver
 *      offer-countries.ts)
 *   2. Meta API /ads_archive às vezes retorna 0 em países específicos mesmo
 *      com ads rodando (bug/limitação conhecida da Meta Ad Library Graph API
 *      — a UI agrega `country=ALL` de forma diferente)
 *   3. Scrape Playwright como Layer 2 fallback depende dessa URL. Se
 *      construída com `country=BR`, perde ads que rodam em outros países.
 *
 * O parâmetro `countries` fica aceito por compat, mas só é usado se alguém
 * explicitamente quiser filtrar (raro).
 */
export function adLibraryPageUrl(
  pageId: string,
  _countries: string[] = ["ALL"]
): string {
  return (
    `https://www.facebook.com/ads/library/` +
    `?view_all_page_id=${pageId}&active_status=active&country=ALL`
  );
}

/**
 * API primeiro, scrape depois. Retorna DomainSearchResult normalizado.
 *
 * @param domain      Hostname normalizado (ex: "techpauloborges.com")
 * @param countries   ISO-2 codes (default ['BR'])
 * @param browser     Instância Playwright (pro scraping fallback)
 */
export async function fetchActiveAdsByDomain(
  domain: string,
  countries: string[] = ["BR"],
  browser?: Browser,
  context?: ApiCallContext
): Promise<DomainSearchResult> {
  // ── Layer 3a: API com search_terms ────────────────────────────
  if (isApiEnabled()) {
    const apiRes: AdCountResult = await fetchActiveAdsBySearchTerms(
      domain,
      countries,
      undefined,
      100,
      context
    );

    if (!apiRes.blocked && apiRes.count !== null) {
      return {
        count: apiRes.count,
        page_ids: apiRes.page_ids ?? [],
        count_by_page_id: apiRes.count_by_page_id ?? {},
        source: "api",
      };
    }
  }

  // ── Layer 3b: Playwright scrape ───────────────────────────────
  if (!browser) {
    return {
      count: null,
      page_ids: [],
      count_by_page_id: {},
      source: "none",
      error: "api_blocked_e_sem_browser_pra_scrape",
    };
  }

  return scrapeAdsByDomain(domain, countries, browser);
}

/**
 * Scrape do Ad Library UI por domínio. Usado quando a API rejeita
 * search_terms ou quando API não tá habilitada.
 *
 * Extrai:
 *   - total de ads via header ("~X resultados")
 *   - count de cards no DOM (fallback)
 *
 * Não agrega page_ids — requer parsing mais caro. Se precisar dos
 * page_ids via scrape, precisa abrir cada ad card (muito mais lento).
 * Pra MVP, só retorna count. discovery_sweep fica dependente da API.
 */
async function scrapeAdsByDomain(
  domain: string,
  countries: string[],
  browser: Browser
): Promise<DomainSearchResult> {
  const url = adLibraryDomainSearchUrl(domain, countries);
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
    serviceWorkers: "block",
  });

  try {
    const page = await context.newPage();

    // Bloqueia recursos pesados
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "media" || type === "font" || type === "image") {
        return route.abort();
      }
      const reqUrl = route.request().url();
      if (
        /google-analytics|googletagmanager|doubleclick|hotjar|clarity\.ms|mixpanel|segment\.io/.test(
          reqUrl
        )
      ) {
        return route.abort();
      }
      route.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 5_000 });
    } catch {
      // segue
    }

    // 1. Text: "~X resultados"
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    const fromText = parseAdCountFromText(text);
    if (fromText !== null) {
      return {
        count: fromText,
        page_ids: [], // scrape não desambigua page_ids sem parser custoso
        count_by_page_id: {},
        source: "scrape",
      };
    }

    // 2. DOM cards fallback
    const fromDom = await countAdCardsFromDom(page);
    if (fromDom !== null) {
      return {
        count: fromDom,
        page_ids: [],
        count_by_page_id: {},
        source: "scrape",
      };
    }

    return {
      count: null,
      page_ids: [],
      count_by_page_id: {},
      source: "none",
      error: "scrape_no_match",
    };
  } catch (err) {
    return {
      count: null,
      page_ids: [],
      count_by_page_id: {},
      source: "none",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await context.close().catch(() => {});
  }
}
