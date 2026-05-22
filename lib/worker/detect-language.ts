/**
 * Detecção de idioma da oferta a partir de sinais coletados do Playwright.
 *
 * Estratégia (em ordem de confiança):
 *   1. HTML lang attribute (`<html lang="en">`) — mais confiável
 *   2. Body text stopwords — heurística simples mas robusta
 *   3. Fallback: pt-BR (default histórico)
 *
 * Suporta os 3 idiomas do sistema: pt-BR, en-US, es-ES.
 */

import type { Language } from "@/lib/types";

const PT_BR_STOPWORDS = [
  "que", "para", "com", "uma", "como", "mais", "está", "você", "isso",
  "muito", "também", "fazer", "tem", "são", "pelo", "pela", "este", "esta",
  "seus", "suas", "agora", "depois", "antes", "porque", "quando", "onde",
  "ainda", "mesmo", "tudo", "nada", "todos", "todas", "outros", "outras",
];

const EN_US_STOPWORDS = [
  "the", "and", "for", "you", "with", "that", "this", "have", "from",
  "your", "will", "what", "when", "they", "would", "there", "could",
  "should", "their", "about", "which", "people", "because", "into", "more",
  "only", "very", "than", "just", "want", "make", "know", "even",
];

const ES_ES_STOPWORDS = [
  "que", "para", "con", "una", "como", "más", "está", "esto", "todo",
  "pero", "muy", "también", "hacer", "tiene", "son", "por", "esta", "este",
  "sus", "ahora", "después", "antes", "porque", "cuando", "donde",
  "todavía", "mismo", "nada", "todos", "todas", "otros", "otras",
];

/**
 * Mapeia HTML lang attribute pra Language do sistema.
 * Aceita variações como "pt", "pt-BR", "pt_BR", "en-US", "en", "es-MX", etc.
 */
function normalizeHtmlLang(raw: string | null | undefined): Language | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/_/g, "-").trim();
  if (lower.startsWith("pt")) return "pt-BR";
  if (lower.startsWith("en")) return "en-US";
  if (lower.startsWith("es") || lower.startsWith("ca")) return "es-ES";
  return null;
}

/**
 * Conta stopwords no texto. Retorna a língua com maior score.
 */
function detectByStopwords(text: string): {
  language: Language | null;
  scores: Record<Language, number>;
} {
  const words = text.toLowerCase().match(/\b[a-záàâãéèêíïóôõöúüç]+\b/g) ?? [];
  const wordSet = new Set(words);
  const scores: Record<Language, number> = {
    "pt-BR": 0,
    "en-US": 0,
    "es-ES": 0,
  };
  for (const w of PT_BR_STOPWORDS) if (wordSet.has(w)) scores["pt-BR"]++;
  for (const w of EN_US_STOPWORDS) if (wordSet.has(w)) scores["en-US"]++;
  for (const w of ES_ES_STOPWORDS) if (wordSet.has(w)) scores["es-ES"]++;

  const maxScore = Math.max(scores["pt-BR"], scores["en-US"], scores["es-ES"]);
  if (maxScore < 3) return { language: null, scores }; // confiança baixa
  const language = (Object.entries(scores).find(
    ([, s]) => s === maxScore
  )?.[0] ?? null) as Language | null;
  return { language, scores };
}

/**
 * Detecta idioma combinando sinais. Retorna `null` se nenhum sinal é
 * confiável o suficiente (caller usa default).
 */
export function detectOfferLanguage(input: {
  htmlLang?: string | null;
  bodyText?: string | null;
  title?: string | null;
}): { language: Language | null; source: string; debug?: unknown } {
  // 1. HTML lang attribute — mais confiável
  const fromHtmlLang = normalizeHtmlLang(input.htmlLang);
  if (fromHtmlLang) {
    return { language: fromHtmlLang, source: `html_lang=${input.htmlLang}` };
  }

  // 2. Body text + title combinado pra stopwords
  const combined = `${input.title ?? ""} ${input.bodyText ?? ""}`.trim();
  if (combined.length < 50) {
    return { language: null, source: "no_text_available" };
  }
  const { language, scores } = detectByStopwords(combined);
  if (language) {
    return { language, source: "stopwords", debug: scores };
  }

  return { language: null, source: "low_confidence", debug: scores };
}
