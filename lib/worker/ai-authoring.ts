/**
 * AI-assisted Authoring — gera sugestões de metadata pra uma oferta
 * via GPT-4o-mini com vision. Lê transcrição do VSL + screenshot da
 * landing principal, retorna JSON estruturado.
 *
 * Resultado é salvo em offers.ai_draft (jsonb) e AGUARDA aprovação do
 * admin via UI antes de atualizar campos reais.
 *
 * Custo: ~$0.003 por oferta.
 */

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { AiDraft, OfferStructure, TrafficSource } from "@/lib/types";
import { getAiSuggestConfigResolved } from "@/lib/queries/ai-suggest-config";

type Supa = SupabaseClient<Database>;

const VALID_STRUCTURES: OfferStructure[] = [
  "vsl",
  "quiz",
  "low_ticket",
  "infoproduto",
];
const VALID_TRAFFIC: TrafficSource[] = ["facebook", "google", "tiktok", "multi"];
const VALID_PRICE_TIERS = ["low", "mid", "high", "unknown"] as const;

export type GenerateResult =
  | { ok: true; draft: AiDraft }
  | { ok: false; error: string };

/**
 * Ponto de entrada chamado pelo handler do worker.
 */
export async function generateAuthoring(
  supa: Supa,
  offerId: string
): Promise<GenerateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY não configurado" };

  // 0. Carrega config do admin (prompts + toggles)
  const config = await getAiSuggestConfigResolved();
  if (!config.enabled) {
    return { ok: false, error: "ai_suggest_disabled_by_admin" };
  }

  // 1. Carrega contexto da oferta
  const { data: offer } = await supa
    .from("offers")
    .select("id, slug, title, niche, language, transcript_text, transcript_preview")
    .eq("id", offerId)
    .maybeSingle<{
      id: string;
      slug: string;
      title: string;
      niche: string;
      language: string;
      transcript_text: string | null;
      transcript_preview: string | null;
    }>();

  if (!offer) return { ok: false, error: "offer_not_found" };

  const transcript =
    offer.transcript_text ?? offer.transcript_preview ?? "";
  if (transcript.length < 200) {
    return {
      ok: false,
      error: "transcript_too_short (pouco texto pra inferir)",
    };
  }

  // 2. Busca screenshot da página main_site (preferencial) ou ad_library
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pageRaw } = await (supa as any)
    .from("pages")
    .select("url, screenshot_url, type")
    .eq("offer_id", offerId)
    .in("type", ["main_site", "checkout", "ad_library"])
    .not("screenshot_url", "is", null)
    .order("type", { ascending: true }) // main_site vem antes alfabeticamente
    .limit(1);
  const page = (pageRaw ?? [])[0] as
    | { url: string; screenshot_url: string | null; type: string }
    | undefined;

  const screenshotUrl = page?.screenshot_url ?? null;
  const domain = page?.url
    ? safeDomain(page.url)
    : null;

  // 3. Monta prompt a partir da config do admin
  const transcriptTrimmed = transcript.slice(0, config.transcript_max_chars);
  const userContent = buildUserContent({
    template: config.user_prompt_template,
    title: offer.title,
    niche: offer.niche,
    domain,
    transcriptTrimmed,
    transcriptMaxChars: config.transcript_max_chars,
    screenshotUrl: config.include_vision ? screenshotUrl : null,
  });

  // 4. Chama GPT-4o-mini (ou modelo configurado)
  const openai = new OpenAI({ apiKey });
  try {
    const res = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: config.system_prompt },
        { role: "user", content: userContent },
      ],
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      response_format: { type: "json_object" },
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? "";
    const parsed = safeParseJson(raw);
    if (!parsed) return { ok: false, error: "invalid_json_response" };

    const draft = validateDraft(parsed, config);

    // Tokens pra tracking de custo
    draft.tokens_used = {
      prompt: res.usage?.prompt_tokens ?? 0,
      completion: res.usage?.completion_tokens ?? 0,
    };
    draft.model = config.model;

    return { ok: true, draft };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "openai_call_failed",
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Prompt building — lê template do banco e faz placeholder replacement
// ─────────────────────────────────────────────────────────────

function renderTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

function buildUserContent(opts: {
  template: string;
  title: string;
  niche: string;
  domain: string | null;
  transcriptTrimmed: string;
  transcriptMaxChars: number;
  screenshotUrl: string | null;
}): OpenAI.Chat.Completions.ChatCompletionUserMessageParam["content"] {
  const textPrompt = renderTemplate(opts.template, {
    title: opts.title,
    niche: opts.niche,
    domain: opts.domain ?? "desconhecido",
    transcript_trimmed: opts.transcriptTrimmed,
    transcript_max_chars: opts.transcriptMaxChars,
  });

  if (!opts.screenshotUrl) {
    return textPrompt;
  }

  return [
    { type: "text", text: textPrompt },
    {
      type: "image_url",
      image_url: {
        url: opts.screenshotUrl,
        detail: "low", // economiza tokens
      },
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// Validação e normalização
// ─────────────────────────────────────────────────────────────

function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    // Remove markdown fences se GPT ignorou a instrução
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type DraftConfig = {
  enable_title: boolean;
  enable_structure: boolean;
  enable_traffic: boolean;
  enable_summary: boolean;
  enable_tags: boolean;
  enable_price_tier: boolean;
};

function validateDraft(
  parsed: Record<string, unknown>,
  config: DraftConfig
): AiDraft {
  const draft: AiDraft = {};

  if (config.enable_title && typeof parsed.suggested_title === "string") {
    const t = parsed.suggested_title.trim();
    if (t.length > 0 && t.length <= 120) draft.suggested_title = t;
  }

  if (
    config.enable_structure &&
    typeof parsed.structure === "string" &&
    VALID_STRUCTURES.includes(parsed.structure as OfferStructure)
  ) {
    draft.structure = parsed.structure as OfferStructure;

    if (typeof parsed.structure_confidence === "number") {
      draft.structure_confidence = Math.max(
        0,
        Math.min(1, parsed.structure_confidence)
      );
    }

    if (typeof parsed.structure_reason === "string") {
      draft.structure_reason = parsed.structure_reason.trim().slice(0, 200);
    }
  }

  if (
    config.enable_traffic &&
    typeof parsed.traffic_source === "string" &&
    VALID_TRAFFIC.includes(parsed.traffic_source as TrafficSource)
  ) {
    draft.traffic_source = parsed.traffic_source as TrafficSource;
  }

  if (config.enable_summary && typeof parsed.ai_summary === "string") {
    const s = parsed.ai_summary.trim();
    if (s.length > 0 && s.length <= 1000) draft.ai_summary = s;
  }

  if (
    config.enable_price_tier &&
    typeof parsed.estimated_price_tier === "string" &&
    (VALID_PRICE_TIERS as readonly string[]).includes(
      parsed.estimated_price_tier
    )
  ) {
    draft.estimated_price_tier = parsed.estimated_price_tier as AiDraft["estimated_price_tier"];
  }

  if (config.enable_tags && Array.isArray(parsed.tags)) {
    const tags = parsed.tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().slice(0, 40))
      .filter((t) => t.length > 0)
      .slice(0, 6);
    if (tags.length > 0) draft.tags = tags;
  }

  return draft;
}

function safeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
