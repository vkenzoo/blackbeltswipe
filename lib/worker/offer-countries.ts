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

/**
 * Lista expandida cobrindo TODOS mercados ocidentais relevantes. Igual
 * ao ALL_COUNTRIES_DEFAULT do bulk-ad-library-prep — mantém consistência
 * entre o scan inicial e refresh/sync.
 *
 * Por que tão amplo: advertisers em pt-BR frequentemente targetam LATAM
 * + Europa + US ao mesmo tempo (Hotmart é global). Se filtramos só BR/PT,
 * perdemos ads que estão running em ES/MX/PE etc → ad_count cai pra 0 →
 * sync_creatives retorna vazio → "nenhum criativo".
 */
const EXPANDED_COUNTRIES = [
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
 * Reserva opcional pro idioma — primary markets que costumam ter
 * tracking diferenciado. Atualmente NÃO usado pra filtrar (volta lista
 * expandida) mas exposto pra UI mostrar "país principal".
 */
const PRIMARY_BY_LANGUAGE: Record<Language, string[]> = {
  "pt-BR": ["BR", "PT"],
  "en-US": ["US", "GB", "CA", "AU"],
  "es-ES": ["ES", "MX", "AR", "CO", "CL"],
};

/**
 * Retorna lista expandida de países pra busca na Meta Ad Library.
 *
 * MUDANÇA (Apr 29): antes retornava só 2-5 países por idioma → muitas
 * ofertas internacionais retornavam ads=0 mesmo tendo dezenas ativos
 * em outros países. Agora sempre retorna a lista expandida (~40 países)
 * pra cobrir o mundo todo. Cost na Meta API é o mesmo (cobra por call,
 * não por país no array).
 */
export function countriesForOfferLanguage(
  _language: string | null | undefined
): string[] {
  return EXPANDED_COUNTRIES;
}

/**
 * Retorna primary markets pro idioma — usado por UI pra hint visual,
 * não pra filtrar API call (que sempre usa lista expandida).
 */
export function primaryCountriesForLanguage(
  language: string | null | undefined
): string[] {
  if (!language) return ["BR"];
  return PRIMARY_BY_LANGUAGE[language as Language] ?? ["BR"];
}

/**
 * True se uma oferta deveria buscar em mais de 1 país. Útil pra UI dar
 * hint ao admin que a oferta é internacional.
 */
export function isMultiCountryOffer(language: string | null | undefined): boolean {
  return countriesForOfferLanguage(language).length > 1;
}
