"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { TimeSeriesBucket } from "@/lib/queries/jobs";
import {
  jobKindColor,
  jobKindLabel,
  formatCost,
} from "@/lib/worker/cost-calculator";

// ─────────────────────────────────────────────────────────────
// Area chart (jobs over time, stacked by kind)
// ─────────────────────────────────────────────────────────────

export function JobsOverTimeChart({
  data,
}: {
  data: TimeSeriesBucket[];
}) {
  // Descobre todos os kinds presentes nos buckets
  const kindsSet = new Set<string>();
  for (const b of data) for (const k of Object.keys(b.byKind)) kindsSet.add(k);
  const kinds = [...kindsSet].sort();

  // Flattens pro formato do recharts: [{ label, timestamp, [kind1]: n, [kind2]: n, ... }]
  const chartData = data.map((b) => {
    const row: Record<string, string | number> = {
      label: b.label,
      timestamp: b.timestamp,
      total: b.total,
    };
    for (const k of kinds) {
      row[k] = b.byKind[k] ?? 0;
    }
    return row;
  });

  const hasData = data.some((b) => b.total > 0);

  if (!hasData) {
    return (
      <div className="h-[280px] grid place-items-center text-[13px] text-text-3">
        Nenhum job nesse período.
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
          <defs>
            {kinds.map((k) => (
              <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={jobKindColor(k)} stopOpacity={0.45} />
                <stop offset="100%" stopColor={jobKindColor(k)} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="2 3"
            stroke="rgba(255,255,255,0.06)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke="rgba(255,255,255,0.4)"
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="rgba(255,255,255,0.4)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
          />
          {kinds.map((k) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stackId="1"
              stroke={jobKindColor(k)}
              strokeWidth={1.5}
              fill={`url(#grad-${k})`}
              name={jobKindLabel(k)}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Custom tooltip — glass aesthetic
// ─────────────────────────────────────────────────────────────

type TooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
};

function ChartTooltip({ active, label, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  // Ordena maior → menor
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return (
    <div
      className="
        rounded-[var(--r-sm)] px-3 py-2
        border border-[var(--border-strong)]
        shadow-[0_8px_32px_-4px_rgba(0,0,0,0.5)]
      "
      style={{
        background: "rgba(18,18,22,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="text-[11px] font-semibold text-text mb-1.5 mono tabular-nums">
        {label} · {total} jobs
      </div>
      <div className="flex flex-col gap-0.5">
        {sorted
          .filter((p) => (p.value ?? 0) > 0)
          .map((p) => (
            <div
              key={p.dataKey}
              className="flex items-center gap-2 text-[11px] justify-between min-w-[140px]"
            >
              <span className="flex items-center gap-1.5 text-text-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: p.color }}
                  aria-hidden="true"
                />
                {p.name}
              </span>
              <span className="mono tabular-nums text-text font-medium">
                {p.value}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pie chart — cost breakdown
// ─────────────────────────────────────────────────────────────

export function CostPieChart({
  data,
}: {
  data: Array<{ kind: string; cost_usd: number; jobs: number }>;
}) {
  if (data.length === 0) {
    return (
      <div className="h-[280px] grid place-items-center text-[13px] text-text-3">
        Sem custos de IA nesse período.
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.cost_usd, 0);

  const chartData = data.map((d) => ({
    ...d,
    name: jobKindLabel(d.kind),
    color: jobKindColor(d.kind),
  }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="cost_usd"
            nameKey="name"
            cx="38%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth={1}
          >
            {chartData.map((entry) => (
              <Cell key={entry.kind} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={<PieTooltip total={total} />}
            cursor={{ fill: "transparent" }}
          />
          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingLeft: 8 }}
            formatter={(value: string, entry: unknown) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const e = entry as { payload?: { cost_usd?: number; jobs?: number } };
              const pct =
                total > 0 ? (((e.payload?.cost_usd ?? 0) / total) * 100).toFixed(0) : 0;
              return (
                <span style={{ color: "var(--text-2)" }}>
                  {value}{" "}
                  <span style={{ color: "var(--text-3)", fontSize: 10 }}>
                    · {pct}%
                  </span>
                </span>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

type PieTooltipProps = {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload?: { kind: string; jobs: number; color: string };
  }>;
  total: number;
};

function PieTooltip({ active, payload, total }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";

  return (
    <div
      className="
        rounded-[var(--r-sm)] px-3 py-2
        border border-[var(--border-strong)]
      "
      style={{
        background: "rgba(18,18,22,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="text-[11px] font-semibold text-text mb-0.5">
        <span
          className="inline-block w-2 h-2 rounded-full mr-1.5"
          style={{ background: p.payload?.color, verticalAlign: "middle" }}
          aria-hidden="true"
        />
        {p.name}
      </div>
      <div className="text-[10.5px] text-text-2 mono tabular-nums">
        {formatCost(p.value)} · {pct}% · {p.payload?.jobs} jobs
      </div>
    </div>
  );
}
