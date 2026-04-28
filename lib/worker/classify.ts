/**
 * Classificação automática de nicho via GPT-4o-mini.
 * Usa título + descrição da landing pra escolher 1 dos 5 nichos consolidados.
 *
 * Custo ~$0.0002 por call (negligenciável).
 */

import OpenAI from "openai";
import type { Niche } from "@/lib/types";

const VALID_NICHES: Niche[] = [
  "renda_extra",
  "ia_tech",
  "mentalidade",
  "beleza",
  "saude",
];

const NICHE_DESCRIPTIONS: Record<Niche, string> = {
  renda_extra:
    "GANHAR DINHEIRO — qualquer oferta sobre: renda online, trabalho remoto, " +
    "investimentos (ações/trading/cripto), dropshipping, e-commerce, Amazon, " +
    "TikTok Shop, marketing digital, tráfego pago, afiliados, copywriter, " +
    "gestor de tráfego, venda de produtos/serviços online, quiz de vocação " +
    "profissional focado em monetizar. Nicho MAIS AMPLO — escolhe esse quando " +
    "a oferta é sobre fazer dinheiro independente do sub-tema.",
  ia_tech:
    "TECNOLOGIA E IA — ferramentas de IA, ChatGPT, automação com tech, " +
    "agência de IA, SaaS, no-code. Escolhe APENAS se o core é tech/IA " +
    "(não 'usar IA pra ganhar dinheiro' — isso é renda_extra).",
  mentalidade:
    "MENTALIDADE / MINDSET — desenvolvimento pessoal, produtividade, hábitos, " +
    "disciplina, espiritualidade, propósito de vida, arquétipos, inteligência " +
    "emocional. NÃO é sobre dinheiro (isso é renda_extra).",
  beleza: "Beleza, estética, maquiagem, cabelo, skincare, moda, self-care.",
  saude:
    "Saúde, emagrecimento, suplementos, fitness, medicina, cura, " +
    "remédios naturais, bem-estar físico, dieta, terapia.",
};

export async function classifyNiche(
  title: string,
  description?: string,
  bodyTexts?: string[]
): Promise<Niche | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey });

  const context = [
    `Title: ${title}`,
    description && `Description: ${description}`,
    bodyTexts && bodyTexts.length > 0 && `Ad copies: ${bodyTexts.slice(0, 3).join(" | ").slice(0, 500)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const nichesList = VALID_NICHES.map(
    (n) => `- ${n}: ${NICHE_DESCRIPTIONS[n]}`
  ).join("\n");

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a Brazilian infoproduct categorization expert. " +
            "Given a product's title/description, classify it into exactly ONE niche. " +
            "Respond with ONLY the niche key (nothing else, no quotes, no punctuation).\n\n" +
            "Available niches:\n" +
            nichesList,
        },
        { role: "user", content: context },
      ],
      temperature: 0,
      max_tokens: 20,
    });

    const raw = res.choices[0]?.message?.content?.trim().toLowerCase() ?? "";
    // Extrai primeira palavra válida (LLM às vezes adiciona aspas ou ponto)
    const cleaned = raw.replace(/[^a-z_]/g, "");
    if (VALID_NICHES.includes(cleaned as Niche)) {
      return cleaned as Niche;
    }
    // fallback: procura qualquer niche válido dentro da resposta
    for (const n of VALID_NICHES) {
      if (raw.includes(n)) return n;
    }
    return null;
  } catch (err) {
    console.warn("[classify] GPT falhou:", err instanceof Error ? err.message : err);
    return null;
  }
}
