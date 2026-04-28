"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SparklinePoint } from "@/lib/queries/offer-sparkline";

/**
 * Sparkline de ad_count nos últimos 30 dias.
 * Mostra também: max/min/atual + delta (%) vs 7 dias atrás.
 */
export function AdCountSparkline({
  data,
  currentAdCount,
}: {
  data: SparklinePoint[];
  currentAdCount: number | null;
}) {
  if (data.length === 0) {
    return (
      <div className="glass rounded-[var(--r-lg)] p-4 flex items-center justify-center min-h-[100px]">
        <p className="text-[12px] text-text-3 text-center">
          Ainda sem histórico.
          <br />
          <span className="text-[10.5px]">
            Snapshots aparecem conforme o worker refresh roda (cada 6-24h).
          </span>
        </p>
      </div>
    );
  }

  // Stats
  const values = data.map((d) => d.ad_count);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const latest = values[values.length - 1];
  const current = currentAdCount ?? latest;

  // Delta vs ~7d atrás
  const sevenDaysAgoIdx = Math.max(0, data.length - 8);
  const sevenDaysAgo = data[sevenDaysAgoIdx]?.ad_count ?? null;
  let deltaPct: number | null = null;
  if (sevenDaysAgo !== null && sevenDaysAgo > 0) {
    deltaPct = ((latest - sevenDaysAgo) / sevenDaysAgo) * 100;
  } else if (sevenDaysAgo === 0 && latest > 0) {
    deltaPct = 999; // "ressuscitou"
  }

  // Cor da curva baseada no trend
  const color =
    deltaPct === null || Math.abs(deltaPct) < 5
      ? "#A1A1A6" // neutro
      : deltaPct > 0
      ? "#10B981" // verde — subindo
      : "#F59E0B"; // amber — caindo

  const chartData = data.map((d) => ({
    date: d.date,
    label: formatDayLabel(d.date),
    ad_count: d.ad_count,
  }));

  return (
    <div className="glass rounded-[var(--r-lg)] p-4 flex flex-col gap-3">
      {/* Header com stats */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em]">
            Histórico 30d · ad_count
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="display text-[24px] font-semibold tracking-[-0.02em] mono tabular-nums">
              {current.toLocaleString("pt-BR")}
            </span>
            {deltaPct !== null && (
              <span
                className="inline-flex items-center gap-0.5 text-[11px] font-medium"
                style={{ color }}
              >
                {deltaPct > 0.5 ? (
                  <TrendingUp size={11} strokeWidth={2} />
                ) : deltaPct < -0.5 ? (
                  <TrendingDown size={11} strokeWidth={2} />
                ) : (
                  <Minus size={11} strokeWidth={2} />
                )}
                {deltaPct === 999
                  ? "revived"
                  : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(0)}% 7d`}
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-[11px] text-text-3 mono tabular-nums leading-tight">
          <div>
            max <span className="text-text-2">{max.toLocaleString("pt-BR")}</span>
          </div>
          <div>
            min <span className="text-text-2">{min.toLocaleString("pt-BR")}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[120px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 6, right: 6, left: 6, bottom: 0 }}
          >
            <defs>
              <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="2 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              stroke="rgba(255,255,255,0.4)"
              fontSize={9}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis hide domain={[0, (dataMax: number) => dataMax * 1.15]} />
            <Tooltip
              content={<SparkTooltip />}
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="ad_count"
              stroke={color}
              strokeWidth={1.5}
              fill="url(#spark-grad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type SparkTooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number; payload: { date: string; label: string } }>;
};

function SparkTooltip({ active, payload }: SparkTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div
      className="rounded-[var(--r-sm)] px-2 py-1.5 border border-[var(--border-strong)]"
      style={{
        background: "rgba(18,18,22,0.94)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div className="text-[10px] text-text-3 mono tabular-nums">
        {formatDayLabelLong(p.payload.date)}
      </div>
      <div className="text-[12px] text-text font-semibold mono tabular-nums">
        {p.value.toLocaleString("pt-BR")} ads
      </div>
    </div>
  );
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(
    d.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

function formatDayLabelLong(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}
