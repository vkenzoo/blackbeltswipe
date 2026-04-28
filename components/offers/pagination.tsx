"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationProps = {
  current?: number;
  total?: number;
  /** Callback quando user clica numa página. Sem isso, botões não fazem nada. */
  onChange?: (page: number) => void;
};

export function Pagination({
  current = 1,
  total = 12,
  onChange,
}: PaginationProps) {
  const pages = buildPages(current, total);

  const goTo = (p: number) => {
    if (!onChange) return;
    const clamped = Math.max(1, Math.min(total, p));
    if (clamped === current) return;
    onChange(clamped);
    // Scroll suave pro topo da lista após trocar de página
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <nav
      className="flex items-center justify-center gap-1"
      aria-label="Paginação"
    >
      <button
        type="button"
        disabled={current === 1}
        onClick={() => goTo(current - 1)}
        className={cn(
          "w-9 h-9 grid place-items-center rounded-full",
          "text-text-2 hover:text-text hover:bg-[var(--bg-glass)]",
          "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-2",
          "transition-[background,color] duration-200"
        )}
        aria-label="Página anterior"
      >
        <ChevronLeft size={16} strokeWidth={1.8} />
      </button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`dots-${i}`}
            className="w-9 h-9 grid place-items-center text-text-3 text-[13px]"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => goTo(p)}
            className={cn(
              "min-w-9 h-9 px-3 rounded-full text-[13px] font-medium",
              "transition-[background,color] duration-200",
              p === current
                ? "bg-[var(--bg-elevated)] text-text border border-[var(--border-default)]"
                : "text-text-2 hover:text-text hover:bg-[var(--bg-glass)]"
            )}
            aria-current={p === current ? "page" : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        disabled={current === total}
        onClick={() => goTo(current + 1)}
        className={cn(
          "w-9 h-9 grid place-items-center rounded-full",
          "text-text-2 hover:text-text hover:bg-[var(--bg-glass)]",
          "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-2",
          "transition-[background,color] duration-200"
        )}
        aria-label="Próxima página"
      >
        <ChevronRight size={16} strokeWidth={1.8} />
      </button>
    </nav>
  );
}

function buildPages(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let p = start; p <= end; p++) pages.push(p);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}
