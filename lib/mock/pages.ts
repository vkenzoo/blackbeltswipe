import type { Page } from "../types";

/**
 * Pages mock por offer_id. 3 páginas por oferta (ad_library, fb_page, main_site).
 * URLs são placeholders.
 */
export function getOfferPages(offerId: string, slug: string): Page[] {
  return [
    {
      id: `${offerId}-page-1`,
      offer_id: offerId,
      type: "ad_library",
      url: `https://www.facebook.com/ads/library/?search_type=keyword_unordered&q=${encodeURIComponent(slug)}`,
      title: "Biblioteca de Anúncios",
    },
    {
      id: `${offerId}-page-2`,
      offer_id: offerId,
      type: "fb_page",
      url: `https://www.facebook.com/${slug.replace(/-/g, "")}`,
      title: "Página do Facebook",
    },
    {
      id: `${offerId}-page-3`,
      offer_id: offerId,
      type: "main_site",
      url: `https://${slug}.com.br`,
      title: "Site Principal",
    },
  ];
}
