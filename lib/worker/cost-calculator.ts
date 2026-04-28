/**
 * cost-calculator — estimativa de custo de IA por job.
 *
 * PURE function — sem side effects, sem DB, testável.
 *
 * Usada pelo admin dashboard de Workers pra mostrar custo estimado por
 * tipo de job e agregado por período.
 *
 * Rates (atualizar quando OpenAI mudar):
 *   - Whisper-1:     $0.006 / minute of audio
 *   - GPT-4o-mini:   $0.15 / 1M input tokens, $0.60 / 1M output tokens
 *   - GPT-4o:        $2.50 / 1M input, $10.00 / 1M output
 *
 * Handlers com custo AI:
 *   - transcribe_vsl:       Whisper (cost ∝ duration)
 *   - transcribe_creative:  Whisper (cost ∝ duration)
 *   - enrich_from_url:      GPT-4o-mini (niche classification, ~1500 tokens)
 *   - enrich_offer:         GPT-4o-mini (~1500 tokens)
 *
 * Handlers sem custo AI (zero):
 *   - screenshot_page, generate_thumb, extract_vsl, refresh_ad_count,
 *     compute_scale_score
 */

// ── Rates (USD) ──
export const RATES = {
  WHISPER_PER_MINUTE: 0.006,
  GPT_4O_MINI_INPUT_PER_1M: 0.15,
  GPT_4O_MINI_OUTPUT_PER_1M: 0.6,
  GPT_4O_INPUT_PER_1M: 2.5,
  GPT_4O_OUTPUT_PER_1M: 10,
} as const;

// Estimativas médias por enrich (niche classification + fallback summarization)
const ENRICH_AVG_INPUT_TOKENS = 1200;
const ENRICH_AVG_OUTPUT_TOKENS = 200;

const DEFAULT_VSL_DURATION_SECONDS = 180;       // fallback 3min
const DEFAULT_CREATIVE_DURATION_SECONDS = 30;   // fallback 30s

export type JobKind =
  | "transcribe_vsl"
  | "transcribe_creative"
  | "enrich_from_url"
  | "enrich_offer"
  | "screenshot_page"
  | "generate_thumb"
  | "extract_vsl"
  | "refresh_ad_count"
  | "compute_scale_score";

export type CostHints = {
  /** Duração do áudio em segundos (pra transcribe). */
  duration_seconds?: number | null;
  /** Tokens input reais usados (se souber). Override do default. */
  input_tokens?: number;
  /** Tokens output reais. */
  output_tokens?: number;
};

export type CostEstimate = {
  usd: number;
  /** Descrição curta da fórmula usada. Útil pro tooltip. */
  explanation: string;
  /** Flag: true se foi estimado sem dados reais (ex: duration faltando). */
  estimated: boolean;
};

/**
 * Estima custo de IA pra um único job.
 *
 * Handlers sem AI retornam { usd: 0, explanation: '—', estimated: false }.
 *
 * @param kind  Tipo do job
 * @param hints Dados auxiliares opcionais
 */
export function estimateJobCost(
  kind: string,
  hints?: CostHints
): CostEstimate {
  const h = hints ?? {};

  switch (kind) {
    case "transcribe_vsl":
    case "transcribe_creative": {
      const hasDur = typeof h.duration_seconds === "number" && h.duration_seconds > 0;
      const dur =
        hasDur && h.duration_seconds
          ? h.duration_seconds
          : kind === "transcribe_vsl"
          ? DEFAULT_VSL_DURATION_SECONDS
          : DEFAULT_CREATIVE_DURATION_SECONDS;
      const minutes = dur / 60;
      const usd = minutes * RATES.WHISPER_PER_MINUTE;
      return {
        usd,
        explanation: `Whisper ${minutes.toFixed(1)}min × $${RATES.WHISPER_PER_MINUTE}`,
        estimated: !hasDur,
      };
    }

    case "enrich_from_url":
    case "enrich_offer": {
      const inTok = h.input_tokens ?? ENRICH_AVG_INPUT_TOKENS;
      const outTok = h.output_tokens ?? ENRICH_AVG_OUTPUT_TOKENS;
      const usd =
        (inTok / 1_000_000) * RATES.GPT_4O_MINI_INPUT_PER_1M +
        (outTok / 1_000_000) * RATES.GPT_4O_MINI_OUTPUT_PER_1M;
      return {
        usd,
        explanation: `GPT-4o-mini ${inTok}in+${outTok}out tokens`,
        estimated: h.input_tokens == null,
      };
    }

    case "screenshot_page":
    case "generate_thumb":
    case "extract_vsl":
    case "refresh_ad_count":
    case "compute_scale_score":
      return { usd: 0, explanation: "—", estimated: false };

    default:
      return { usd: 0, explanation: "kind desconhecido", estimated: false };
  }
}

/**
 * Soma custos de um array de jobs. Hints map opcional por job id.
 */
export function sumJobCosts(
  jobs: Array<{ id: string; kind: string }>,
  hintsMap?: Record<string, CostHints>
): number {
  return jobs.reduce((acc, j) => {
    const hints = hintsMap?.[j.id];
    return acc + estimateJobCost(j.kind, hints).usd;
  }, 0);
}

/**
 * Formata USD pra display: $12.34 ou $0.0045 (4 casas pra <$0.01).
 */
export function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Helper: label curto pra cada job kind (pra usar na UI).
 */
export function jobKindLabel(kind: string): string {
  const map: Record<string, string> = {
    enrich_from_url: "Enriquecer (URL)",
    enrich_offer: "Enriquecer",
    extract_vsl: "Extrair VSL",
    generate_thumb: "Gerar thumb",
    screenshot_page: "Screenshot",
    transcribe_vsl: "Transcrever VSL",
    transcribe_creative: "Transcrever criativo",
    refresh_ad_count: "Atualizar ad_count",
    compute_scale_score: "Calcular score",
  };
  return map[kind] ?? kind;
}

/**
 * Cor suave pra cada kind — pra chips/pills no admin.
 */
export function jobKindColor(kind: string): string {
  const map: Record<string, string> = {
    enrich_from_url: "#8B5CF6",       // violet — AI heavy
    enrich_offer: "#8B5CF6",
    transcribe_vsl: "#EC4899",        // pink — Whisper
    transcribe_creative: "#EC4899",
    screenshot_page: "#06B6D4",       // cyan — browser
    refresh_ad_count: "#06B6D4",
    generate_thumb: "#10B981",        // green — ffmpeg
    extract_vsl: "#10B981",
    compute_scale_score: "#F59E0B",   // amber — pure compute
  };
  return map[kind] ?? "#71717A";
}
