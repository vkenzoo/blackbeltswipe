/**
 * ad-count-extractor — extrai a contagem de anúncios ativos de uma página
 * da Meta Ad Library (ou aproxima de fb_page).
 *
 * Estratégia em camadas (fallback chain):
 *   1. Texto visível "~X resultados" / "~X results" — mais confiável
 *   2. Contagem de cards via seletor (fallback quando header muda)
 *   3. GraphQL payload (se interceptado — opcional)
 *
 * Retorna null se nada funcionar (o caller decide o que fazer).
 *
 * Reusado por:
 *   - worker/handlers/refresh-ad-count.ts (sweep diário)
 *   - lib/worker/enrich.ts (enrichment inicial — chamado via extractAdCount)
 */

import type { Page } from "playwright";

/**
 * Extrai ad_count do innerText (método principal).
 *
 * Patterns suportados:
 *   - "~2.400 resultados" (pt-BR)
 *   - "~2,400 results"    (en)
 *   - "2.400 resultados"  (sem ~)
 *   - "About 2,400 results"
 *   - "Approximately 2.400 resultados"
 */
export function parseAdCountFromText(text: string): number | null {
  if (!text) return null;

  // Patterns em ordem: mais específico primeiro
  const patterns = [
    /~?\s*([\d.,]+)\s+(resultados|results)\b/i,
    /about\s+([\d.,]+)\s+results/i,
    /aproximadamente\s+([\d.,]+)\s+resultados/i,
    /cerca de\s+([\d.,]+)\s+resultados/i,
  ];

  for (const rx of patterns) {
    const m = text.match(rx);
    if (m) {
      // Remove separadores de milhar (. ou ,). PT-BR usa "." como milhar.
      // EN usa "," como milhar. Removendo ambos preserva o inteiro.
      const raw = m[1].replace(/[.,]/g, "");
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }

  return null;
}

/**
 * Conta ads via seletor DOM — fallback quando o header de contagem
 * não aparece (ex: queries que retornam <50 ads, Meta não mostra header).
 *
 * Conta cards únicos procurando seletores típicos de ad card.
 * Imperfeito mas dá ordem de grandeza.
 */
export async function countAdCardsFromDom(page: Page): Promise<number | null> {
  try {
    const count = await page.evaluate(() => {
      // Meta Ad Library: cada ad vive num container com data-testid="ad_card"
      // ou classes específicas. A gente tenta múltiplos seletores.
      const selectors = [
        '[data-testid="ad_card"]',
        '[role="article"]',
        'div[class*="ad_library_card"]',
      ];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) return els.length;
      }
      return 0;
    });
    return count > 0 ? count : null;
  } catch {
    return null;
  }
}

/**
 * API principal: tenta text first, depois DOM count como fallback.
 *
 * Retorna:
 *   { count: number | null, source: 'text' | 'dom' | 'none' }
 *
 * source permite ao caller logar/decidir confiança.
 */
export async function extractAdCount(
  page: Page
): Promise<{ count: number | null; source: "text" | "dom" | "none" }> {
  // 1. Text innerText
  try {
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    const fromText = parseAdCountFromText(text);
    if (fromText !== null) {
      return { count: fromText, source: "text" };
    }
  } catch {
    // Ignore, tenta DOM
  }

  // 2. DOM card count
  const fromDom = await countAdCardsFromDom(page);
  if (fromDom !== null) {
    return { count: fromDom, source: "dom" };
  }

  return { count: null, source: "none" };
}
