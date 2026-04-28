"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type FilterKey = "all" | "stale" | "zero" | "growing" | "declining";

const LABELS: Record<FilterKey, string> = {
  all: "Todas",
  stale: "Stale (>48h)",
  zero: "Zeradas",
  growing: "Crescendo",
  declining: "Caindo",
};

export function FilterChips({
  active,
  counts,
}: {
  active: FilterKey;
  counts: Record<FilterKey, number>;
}) {
  const params = useSearchParams();
  const keys: FilterKey[] = ["all", "stale", "zero", "growing", "declining"];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {keys.map((k) => {
        const isActive = k === active;
        const qs = new URLSearchParams(params);
        if (k === "all") qs.delete("filter");
        else qs.set("filter", k);
        const href = `/admin/contagem-ads${qs.toString() ? `?${qs.toString()}` : ""}`;
        return (
          <Link
            key={k}
            href={href}
            className={`
              inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium
              transition-colors
              ${
                isActive
                  ? "bg-[var(--accent)] text-[var(--bg)]"
                  : "glass-light text-text-2 hover:text-text hover:bg-[var(--bg-glass-hover)]"
              }
            `}
          >
            {LABELS[k]}
            <span
              className={`text-[11px] font-semibold tabular-nums ${isActive ? "opacity-70" : "opacity-60"}`}
            >
              {counts[k]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
