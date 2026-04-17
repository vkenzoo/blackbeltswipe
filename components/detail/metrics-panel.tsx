"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ChevronUp } from "lucide-react";
import type { MetricWindow, Offer } from "@/lib/types";
import { getOfferMetrics } from "@/lib/mock/metrics";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Recharts precisa de medidas reais do DOM. Desabilita SSR pra evitar
// warnings de "width(-1) and height(-1)" e hydration mismatch.
const MetricsChart = dynamic(
  () => import("./metrics-chart").then((m) => m.MetricsChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[140px] skeleton mx-2 rounded-[var(--r-md)]" />
    ),
  }
);

const WINDOWS: { key: MetricWindow; label: string }[] = [
  { key: "6m", label: "6 meses" },
  { key: "3m", label: "3 meses" },
  { key: "30d", label: "30 dias" },
  { key: "7d", label: "7 dias" },
];

export function MetricsPanel({ offer }: { offer: Offer }) {
  const [window, setWindow] = useState<MetricWindow>("30d");
  const metrics = getOfferMetrics(offer.id, window, offer.ad_count);
  const positive = metrics.delta_percent >= 0;

  return (
    <div className="glass rounded-[var(--r-xl)] p-5 md:p-6 flex flex-col gap-5">
      {/* Tabs */}
      <div
        className="flex items-center gap-0.5 p-[3px] rounded-full border border-[var(--border-hairline)]"
        style={{ background: "rgba(0,0,0,0.3)" }}
      >
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setWindow(w.key)}
            className={cn(
              "flex-1 py-1.5 px-2 text-[11px] font-medium rounded-full",
              "transition-[background,color] duration-200 ease-[var(--ease-standard)]",
              window === w.key
                ? "bg-[var(--bg-elevated)] text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "text-text-3 hover:text-text-2"
            )}
            aria-pressed={window === w.key}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Big number */}
      <div>
        <div className="mono text-[44px] leading-none font-semibold tracking-[-0.04em]">
          {formatNumber(metrics.series[metrics.series.length - 1].ad_count)}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[13px] text-text-2">
          anúncios ativos
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[12px] font-medium",
              positive ? "text-[var(--success)]" : "text-[var(--error)]"
            )}
          >
            <ChevronUp
              size={11}
              strokeWidth={2.5}
              className={positive ? "" : "rotate-180"}
            />
            {positive ? "+" : ""}
            {metrics.delta_percent}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <MetricsChart data={metrics.series} />
    </div>
  );
}
