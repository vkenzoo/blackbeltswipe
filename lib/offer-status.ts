/**
 * Helpers de status de oferta — detecção robusta de estados "virtuais"
 * que não estão no enum `status` mas dependem de outros sinais.
 */

type OfferLike = {
  slug: string;
  title: string;
  vsl_storage_path?: string | null;
};

/**
 * Indica se a oferta está no fluxo de extração automática (from-url).
 *
 * Detecção robusta — combina 2 sinais pra não dar falso-positivo caso um
 * admin crie oferta real com título "Extraindo...":
 *   1. Slug prefix `enriching-` (criado pelo endpoint /from-url)
 *   2. Título placeholder "Extraindo..."
 *
 * Basta um dos dois bater. O worker atualiza AMBOS (slug e título) ao
 * finalizar, então a transição pra "done" é limpa.
 *
 * Sinal negativo adicional: se a oferta já tem `vsl_storage_path`, o worker
 * já completou a parte pesada — mesmo que o título ainda esteja "Extraindo..."
 * por algum motivo, provavelmente não é mais extraindo.
 */
export function isOfferExtracting(offer: OfferLike): boolean {
  if (offer.vsl_storage_path) return false;
  return (
    offer.slug.startsWith("enriching-") || offer.title === "Extraindo..."
  );
}
