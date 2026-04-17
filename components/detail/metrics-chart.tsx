"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Metric } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

export function MetricsChart({ data }: { data: Metric[] }) {
  return (
    <div className="h-[140px] -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F5F5F7" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#F5F5F7" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="date" hide />
          <YAxis hide />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
            contentStyle={{
              background: "rgba(28,28,30,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "12px",
              padding: "8px 12px",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              color: "#F5F5F7",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
            labelFormatter={(label) => {
              if (typeof label !== "string") return "";
              const d = new Date(label);
              return d.toLocaleDateString("pt-BR", {
                day: "numeric",
                month: "short",
              });
            }}
            formatter={(value) => [formatNumber(Number(value)), "anúncios"]}
          />
          <Area
            type="monotone"
            dataKey="ad_count"
            stroke="#F5F5F7"
            strokeWidth={2}
            fill="url(#chartFill)"
            activeDot={{
              r: 4,
              fill: "#F5F5F7",
              stroke: "#000",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
