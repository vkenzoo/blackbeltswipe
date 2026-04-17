import type { Metric, OfferMetrics, MetricWindow } from "../types";

/**
 * Gera série temporal trending up com ruído, determinística pelo seed.
 */
function generateSeries(
  seed: number,
  days: number,
  startValue: number,
  endValue: number
): Metric[] {
  const series: Metric[] = [];
  const now = new Date("2026-04-17T00:00:00Z").getTime();
  const dayMs = 86400000;

  for (let i = 0; i < days; i++) {
    const progress = i / (days - 1);
    const linear = startValue + (endValue - startValue) * progress;
    // pseudo-random ruído determinístico
    const noise = Math.sin(seed * (i + 1) * 0.31) * (endValue * 0.08);
    const value = Math.max(0, Math.round(linear + noise));
    const date = new Date(now - (days - 1 - i) * dayMs).toISOString().slice(0, 10);
    series.push({ date, ad_count: value });
  }
  return series;
}

const WINDOW_DAYS: Record<MetricWindow, number> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "6m": 180,
};

export function getOfferMetrics(offerId: string, window: MetricWindow, currentAdCount: number): OfferMetrics {
  const seed = offerId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const days = WINDOW_DAYS[window];
  // Começa em 40-60% do current, termina em current com leve overshoot
  const startValue = Math.round(currentAdCount * (0.35 + (seed % 20) / 100));
  const endValue = currentAdCount;
  const series = generateSeries(seed, days, startValue, endValue);

  const first = series[0].ad_count;
  const last = series[series.length - 1].ad_count;
  const delta = first === 0 ? 0 : Math.round(((last - first) / first) * 100);

  return {
    offer_id: offerId,
    window,
    series,
    delta_percent: delta,
  };
}
