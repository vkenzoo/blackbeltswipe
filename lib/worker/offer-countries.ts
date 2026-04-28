/**
 * Mapping de `offer.language` → países relevantes pra busca na Meta Ad Library.
 *
 * Problema que resolve: advertiser roda ads em múltiplos países (BR + PT + ES
 * pra produto em português, US + GB + CA pra inglês). Se filtramos só BR,
 * perdemos ad_count de ofertas internacionais que na verdade têm dezenas
 * de ads ativos.
 *
 * Regra: sempre inclui o país principal do idioma + vizinhos culturais.
 * Ajuste conservador — muitos países = mais calls lentas, poucos = perde ads.
 */

import type { Language } from "@/lib/types";

const COUNTRIES_BY_LANGUAGE: Record<Language, string[]> = {
  // Português: Brasil é dominante mas Portugal tem market relevante
  "pt-BR": ["BR", "PT"],

  // Inglês: anglosfera toda
  "en-US": ["US", "GB", "CA", "AU"],

  // Espanhol: Espanha + principais mercados LATAM
  "es-ES": ["ES", "MX", "AR", "CO", "CL"],
};

/**
 * Retorna lista de países pra busca na Meta Ad Library, baseado no idioma
 * cadastrado da oferta. Se language for desconhecida, retorna só BR.
 */
export function countriesForOfferLanguage(
  language: string | null | undefined
): string[] {
  if (!language) return ["BR"];
  const list = COUNTRIES_BY_LANGUAGE[language as Language];
  return list ?? ["BR"];
}

/**
 * True se uma oferta deveria buscar em mais de 1 país. Útil pra UI dar
 * hint ao admin que a oferta é internacional.
 */
export function isMultiCountryOffer(language: string | null | undefined): boolean {
  return countriesForOfferLanguage(language).length > 1;
}
