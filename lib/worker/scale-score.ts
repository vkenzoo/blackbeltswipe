/**
 * scale-score — calcula scale_score (0-100), scale_trend e scale_velocity
 * a partir de snapshots temporais de offer_metrics.
 *
 * PURE function — sem side effects, testável, determinístico.
 *
 * Fórmula:
 *   score = clamp(
 *     0.30 * absolute_factor      // log10 do ad_count atual (satura em 100 ads)
 *   + 0.30 * growth_factor        // % change vs 7d atrás, normalizado
 *   + 0.20 * creative_factor      // rotação de criativos nos últimos 7d
 *   + 0.20 * longevity_factor,    // quanto tempo a oferta tá no ar
 *     0, 100
 *   )
 *
 * Buckets (trend):
 *   🔥 ≥80: rising
 *   📈 60-79: rising
 *   🌡 30-59: steady
 *   ❄️ 10-29: cooling
 *   ⚰️ <10: dead
 */

export type Snapshot = {
  /** YYYY-MM-DDTHH:mm:ss UTC */
  sampled_at: string;
  ad_count: number;
  creative_count?: number | null;
};

export type ScaleResult = {
  /** 0-100 inteiro */
  score: number;
  /** 'rising' | 'steady' | 'cooling' | 'dead' */
  trend: "rising" | "steady" | "cooling" | "dead";
  /** % change 7d, ex: 12.5 = +12.5% */
  velocity: number;
  /** Quantos dias consecutivos com ad_count=0 até hoje (inclusive) */
  consecutive_zero_days: number;
};

/**
 * Parâmetros opcionais pra tunar weights/thresholds via env.
 */
export type ScaleConfig = {
  weights?: {
    absolute: number;
    growth: number;
    creative: number;
    longevity: number;
  };
  /** Quantos ads = score_absolute 100 (saturação log10). Default: 100 */
  saturationAds?: number;
  /** Dias que somam pro longevity_bonus completo. Default: 90 */
  longevityDays?: number;
};

const DEFAULTS: Required<ScaleConfig> = {
  weights: { absolute: 0.3, growth: 0.3, creative: 0.2, longevity: 0.2 },
  saturationAds: 100,
  longevityDays: 90,
};

/**
 * Core: recebe snapshots (ordenados ou não) + created_at da oferta,
 * retorna score + trend + velocity + consecutive_zero_days.
 *
 * Snapshots podem vir em qualquer ordem; função ordena internamente.
 * Se array vazio, retorna score 0 + trend 'dead'.
 */
export function computeScaleScore(
  snapshots: Snapshot[],
  offerCreatedAt: string | Date,
  config?: ScaleConfig
): ScaleResult {
  const cfg = { ...DEFAULTS, ...config, weights: { ...DEFAULTS.weights, ...config?.weights } };

  if (!snapshots.length) {
    return { score: 0, trend: "dead", velocity: 0, consecutive_zero_days: 0 };
  }

  // Ordena crescente por sampled_at (oldest → newest)
  const sorted = [...snapshots].sort(
    (a, b) =>
      new Date(a.sampled_at).getTime() - new Date(b.sampled_at).getTime()
  );

  const latest = sorted[sorted.length - 1];
  const adCountNow = latest.ad_count ?? 0;

  // ── Factor 1: absolute (log10 do ad_count, satura em saturationAds)
  // log10(1+count)/log10(1+saturation) * 100 → 0..100
  const absoluteFactor =
    (Math.log10(1 + adCountNow) / Math.log10(1 + cfg.saturationAds)) * 100;

  // ── Factor 2: growth 7d ──────────────────────────────────────
  // Acha snapshot ~7 dias atrás (o mais próximo de 7d ago)
  const sevenDaysAgoTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let snapshot7d: Snapshot | null = null;
  let smallestDiff = Infinity;
  for (const s of sorted) {
    const diff = Math.abs(new Date(s.sampled_at).getTime() - sevenDaysAgoTs);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      snapshot7d = s;
    }
  }
  // Só usa se o match tá entre 5d e 10d atrás (tolerance de ±2d)
  const maxDiffMs = 2 * 24 * 60 * 60 * 1000;
  const ad7d =
    snapshot7d && smallestDiff <= maxDiffMs ? snapshot7d.ad_count ?? 0 : null;

  let velocity = 0; // % change
  let growthFactor = 50; // neutro
  if (ad7d !== null && ad7d > 0) {
    velocity = ((adCountNow - ad7d) / ad7d) * 100;
    // Clamp velocity em -100 a +200 pra não explodir score
    const clamped = Math.max(-100, Math.min(200, velocity));
    // Normaliza: -100% → 0, 0% → 50, +100%+ → 100
    growthFactor = Math.max(0, Math.min(100, 50 + clamped * 0.5));
  } else if (ad7d === 0 && adCountNow > 0) {
    // Oferta ressuscitou → growth factor max
    velocity = 999;
    growthFactor = 100;
  } else if (adCountNow === 0) {
    // Oferta morreu
    velocity = -100;
    growthFactor = 0;
  }

  // ── Factor 3: creative velocity ──────────────────────────────
  // Se a gente tem creative_count em 2+ snapshots, vê se subiu nos últimos 7d.
  let creativeFactor = 50; // neutro
  if (latest.creative_count != null && snapshot7d?.creative_count != null) {
    const deltaCreatives = latest.creative_count - snapshot7d.creative_count;
    if (deltaCreatives > 0) {
      // +1 criativo novo = +20 pontos, até +5 novos = 100
      creativeFactor = Math.min(100, 50 + deltaCreatives * 10);
    } else if (deltaCreatives < 0) {
      creativeFactor = Math.max(0, 50 + deltaCreatives * 10);
    }
  }

  // ── Factor 4: longevity ──────────────────────────────────────
  const createdTs = new Date(offerCreatedAt).getTime();
  const ageDays = Math.max(
    0,
    (Date.now() - createdTs) / (1000 * 60 * 60 * 24)
  );
  const longevityFactor = Math.min(100, (ageDays / cfg.longevityDays) * 100);

  // ── Score final ──────────────────────────────────────────────
  const score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        cfg.weights.absolute * absoluteFactor +
          cfg.weights.growth * growthFactor +
          cfg.weights.creative * creativeFactor +
          cfg.weights.longevity * longevityFactor
      )
    )
  );

  // ── Trend bucket ─────────────────────────────────────────────
  const trend: ScaleResult["trend"] =
    adCountNow === 0 && consecutiveZeroDaysCount(sorted) >= 3
      ? "dead"
      : score >= 60
      ? "rising"
      : score >= 30
      ? "steady"
      : score >= 10
      ? "cooling"
      : "dead";

  // ── Consecutive zero days ────────────────────────────────────
  const consecutive_zero_days = consecutiveZeroDaysCount(sorted);

  return {
    score,
    trend,
    velocity: Number(velocity.toFixed(2)),
    consecutive_zero_days,
  };
}

/**
 * Conta quantos dos últimos snapshots consecutivos (partindo do mais recente,
 * andando pra trás) têm ad_count === 0. Usado pra decidir auto-pause.
 */
function consecutiveZeroDaysCount(sortedAsc: Snapshot[]): number {
  let count = 0;
  for (let i = sortedAsc.length - 1; i >= 0; i--) {
    if ((sortedAsc[i].ad_count ?? 0) === 0) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Helper pra UI: mapeia trend → emoji + cor CSS var.
 */
export function trendBadge(score: number): {
  emoji: string;
  label: string;
  color: string;
} {
  if (score >= 80) return { emoji: "🔥", label: "Hot", color: "var(--error)" };
  if (score >= 60) return { emoji: "📈", label: "Rising", color: "#F59E0B" };
  if (score >= 30) return { emoji: "🌡", label: "Steady", color: "var(--text-2)" };
  if (score >= 10) return { emoji: "❄️", label: "Cooling", color: "#60A5FA" };
  return { emoji: "⚰️", label: "Dead", color: "var(--text-3)" };
}
