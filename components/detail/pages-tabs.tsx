"use client";

import { useState } from "react";
import { ArrowUpRight, Globe, FileText, Library } from "lucide-react";
import type { Page, PageType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS: { key: "all" | PageType; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { key: "all", label: "Todas", icon: Globe },
  { key: "main_site", label: "Site Principal", icon: Globe },
  { key: "fb_page", label: "Páginas do Facebook", icon: FileText },
  { key: "ad_library", label: "Biblioteca de Anúncios", icon: Library },
];

const PAGE_TYPE_LABEL: Record<PageType, string> = {
  main_site: "Site Principal",
  fb_page: "Página Facebook",
  ad_library: "Biblioteca de Anúncios",
  checkout: "Checkout",
};

export function PagesTabs({ pages }: { pages: Page[] }) {
  const [active, setActive] = useState<"all" | PageType>("all");
  const filtered = active === "all" ? pages : pages.filter((p) => p.type === active);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
          Página
        </div>
        <h2 className="display text-[22px] font-semibold tracking-[-0.03em]">
          Landing pages e biblioteca
        </h2>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border-hairline)] pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-2 rounded-[var(--r-sm)]",
                "text-[13px] font-medium",
                "transition-[background,color] duration-200 ease-[var(--ease-standard)]",
                isActive
                  ? "bg-[var(--bg-elevated)] text-text"
                  : "text-text-2 hover:text-text hover:bg-[var(--bg-glass)]"
              )}
              aria-pressed={isActive}
            >
              <Icon size={14} strokeWidth={1.5} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {filtered.map((page) => (
          <a
            key={page.id}
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="
              group relative
              glass
              rounded-[var(--r-lg)] p-4
              flex flex-col gap-3
              transition-[transform,border-color,background] duration-[280ms] ease-[var(--ease-spring)]
              hover:-translate-y-[2px] hover:border-[var(--border-strong)]
            "
          >
            <div
              className="aspect-[16/10] rounded-[var(--r-md)] border border-[var(--border-hairline)] relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #1a1a1a 0%, #2c2c2e 100%)",
              }}
            >
              <div className="absolute inset-0 grid place-items-center">
                <span className="text-text-3 text-[11px] uppercase tracking-[0.14em] font-semibold">
                  {PAGE_TYPE_LABEL[page.type]}
                </span>
              </div>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-text truncate">
                  {page.title}
                </div>
                <div className="text-[11px] text-text-3 truncate mono mt-0.5">
                  {page.url.replace(/^https?:\/\//, "")}
                </div>
              </div>
              <ArrowUpRight
                size={14}
                strokeWidth={1.8}
                className="text-text-3 group-hover:text-text shrink-0 mt-0.5 transition-colors"
              />
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
