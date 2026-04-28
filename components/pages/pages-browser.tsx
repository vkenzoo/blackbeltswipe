"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X, ExternalLink, Image as ImageIcon, Clock } from "lucide-react";
import {
  LANGUAGE_LABELS,
  NICHE_EMOJI,
  NICHE_LABELS,
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
  type Niche,
  type Language,
  type OfferStructure,
  type TrafficSource,
  type PageType,
} from "@/lib/types";

type OfferLite = {
  id: string;
  slug: string;
  title: string;
  niche: Niche;
  language: Language;
  structure: OfferStructure;
  traffic_source: TrafficSource;
  status: string;
};

type PageWithOffer = {
  id: string;
  offer_id: string;
  type: PageType;
  url: string;
  title: string | null;
  screenshot_url: string | null;
  fetched_at: string | null;
  visible: boolean;
  display_order: number;
  offer: OfferLite;
};

type Filters = {
  search: string;
  type: PageType | "";
  niche: Niche | "";
  language: Language | "";
  structure: OfferStructure | "";
  traffic: TrafficSource | "";
  onlyWithScreenshot: boolean;
};

const EMPTY: Filters = {
  search: "",
  type: "",
  niche: "",
  language: "",
  structure: "",
  traffic: "",
  onlyWithScreenshot: false,
};

const PAGE_TYPE_LABEL: Record<PageType, string> = {
  main_site: "Site Principal",
  fb_page: "Página do Facebook",
  ad_library: "Biblioteca do Facebook",
  checkout: "Checkout",
};

const PAGE_TYPE_SHORT: Record<PageType, string> = {
  main_site: "Landing Page",
  fb_page: "FB Page",
  ad_library: "Ad Library",
  checkout: "Checkout",
};

const selectStyle = `
  h-9 px-3 pr-8 text-[12px] font-medium
  glass-light rounded-full
  text-text appearance-none cursor-pointer
  bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23A1A1A6%22 stroke-width=%221.8%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]
  bg-no-repeat bg-[right_12px_center]
  hover:bg-[var(--bg-glass-hover)]
  transition-colors
`;

export function PagesBrowser({ pages }: { pages: PageWithOffer[] }) {
  const [filters, setFilters] = useState<Filters>(EMPTY);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clear() {
    setFilters(EMPTY);
  }

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return pages.filter((p) => {
      if (search) {
        const hay = `${p.title ?? ""} ${p.url} ${p.offer.title} ${p.offer.slug}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (filters.type && p.type !== filters.type) return false;
      if (filters.niche && p.offer.niche !== filters.niche) return false;
      if (filters.language && p.offer.language !== filters.language) return false;
      if (filters.structure && p.offer.structure !== filters.structure) return false;
      if (filters.traffic && p.offer.traffic_source !== filters.traffic) return false;
      if (filters.onlyWithScreenshot && !p.screenshot_url) return false;
      return true;
    });
  }, [pages, filters]);

  const activeCount = [
    filters.search.trim(),
    filters.type,
    filters.niche,
    filters.language,
    filters.structure,
    filters.traffic,
    filters.onlyWithScreenshot ? "1" : "",
  ].filter(Boolean).length;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search
            size={13}
            strokeWidth={1.8}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="Buscar páginas..."
            className="
              w-56 h-9 pl-8 pr-3 text-[13px]
              glass-light rounded-full text-text placeholder:text-text-3
              focus:outline-none focus:border-[var(--accent)]
            "
          />
        </div>

        <select
          value={filters.type}
          onChange={(e) => update("type", e.target.value as PageType | "")}
          className={selectStyle}
        >
          <option value="">Todos tipos</option>
          {(Object.keys(PAGE_TYPE_LABEL) as PageType[]).map((t) => (
            <option key={t} value={t}>{PAGE_TYPE_LABEL[t]}</option>
          ))}
        </select>

        <select
          value={filters.niche}
          onChange={(e) => update("niche", e.target.value as Niche | "")}
          className={selectStyle}
        >
          <option value="">🌱 Todos nichos</option>
          {Object.entries(NICHE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {NICHE_EMOJI[k as Niche]} {v}
            </option>
          ))}
        </select>

        <select
          value={filters.language}
          onChange={(e) => update("language", e.target.value as Language | "")}
          className={selectStyle}
        >
          <option value="">🌐 Todos idiomas</option>
          {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.flag} {v.label.replace(/\s*\([^)]*\)/, "")}
            </option>
          ))}
        </select>

        <select
          value={filters.structure}
          onChange={(e) => update("structure", e.target.value as OfferStructure | "")}
          className={selectStyle}
        >
          <option value="">Todas estruturas</option>
          {Object.entries(STRUCTURE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          value={filters.traffic}
          onChange={(e) => update("traffic", e.target.value as TrafficSource | "")}
          className={selectStyle}
        >
          <option value="">Todo tráfego</option>
          {Object.entries(TRAFFIC_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <label className="inline-flex items-center gap-2 h-9 px-3 rounded-full glass-light text-[12px] cursor-pointer hover:bg-[var(--bg-glass-hover)]">
          <input
            type="checkbox"
            checked={filters.onlyWithScreenshot}
            onChange={(e) => update("onlyWithScreenshot", e.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--accent)]"
          />
          Só com screenshot
        </label>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="
              inline-flex items-center gap-1.5 h-9 px-3 rounded-full
              text-[12px] font-medium text-[var(--error)]
              hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]
              transition-colors
            "
          >
            <X size={12} strokeWidth={2} />
            Limpar ({activeCount})
          </button>
        )}
      </div>

      {activeCount > 0 && (
        <div className="text-[12px] text-text-3 -mt-2">
          {filtered.length} página{filtered.length === 1 ? "" : "s"} encontrada{filtered.length === 1 ? "" : "s"}
          {filtered.length !== pages.length && ` de ${pages.length} total`}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="glass rounded-[var(--r-lg)] p-12 text-center">
          <p className="text-[14px] text-text-2">
            {pages.length === 0
              ? "Nenhuma página cadastrada ainda."
              : "Nenhuma página bate com os filtros atuais."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <PageCard key={p.id} page={p} />
          ))}
        </div>
      )}
    </>
  );
}

function PageCard({ page }: { page: PageWithOffer }) {
  const enriched = !!page.fetched_at;
  const typeLabel = PAGE_TYPE_LABEL[page.type];
  const shortLabel = PAGE_TYPE_SHORT[page.type];
  const hostname = (() => {
    try {
      return new URL(page.url).hostname;
    } catch {
      return typeLabel;
    }
  })();

  return (
    <Link
      href={page.url}
      target="_blank"
      rel="noopener noreferrer"
      className="
        group glass rounded-[var(--r-lg)] overflow-hidden flex flex-col
        cursor-pointer
        transition-[transform,border-color] duration-[280ms] ease-[var(--ease-spring)]
        hover:-translate-y-[2px] hover:border-[var(--border-strong)]
      "
    >
      <div className="px-4 pt-4 pb-2 flex flex-col gap-1.5 items-center text-center">
        <h3 className="display text-[14px] font-semibold tracking-[-0.01em] line-clamp-1 w-full">
          {page.title || shortLabel}
        </h3>
        <span
          className="
            inline-flex items-center text-[10px] font-medium
            px-2 py-0.5 rounded-full
            text-[var(--success)] border border-[var(--success)]/30
          "
          style={{ background: "color-mix(in srgb, var(--success) 10%, transparent)" }}
        >
          {page.offer.title}
        </span>
      </div>

      <div className="mx-3 mb-3 aspect-[4/3] rounded-[var(--r-md)] border border-[var(--border-hairline)] overflow-hidden relative bg-[var(--bg-elevated)]">
        {page.screenshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.screenshot_url}
            alt={`Screenshot da página ${page.type} de ${page.offer.title}`}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-1.5 text-text-4">
              <ImageIcon size={18} strokeWidth={1.5} />
              <span className="text-[9px] uppercase tracking-wider">screenshot em breve</span>
            </div>
          </div>
        )}

        <div
          className="
            absolute inset-0 z-10 flex items-end justify-center
            opacity-0 group-hover:opacity-100 transition-opacity duration-200
            bg-gradient-to-t from-black/60 via-transparent to-transparent
            p-3 pointer-events-none
          "
          aria-hidden="true"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-[11px] font-medium shadow-lg">
            Abrir <ExternalLink size={11} strokeWidth={2} />
          </span>
        </div>
      </div>

      <div className="mt-auto px-4 py-3 border-t border-[var(--border-hairline)] flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-3 truncate" title={page.url}>
          {hostname}
        </span>
        {enriched ? (
          <span
            className="inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
            style={{
              background: "linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)",
            }}
          >
            {typeLabel}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full text-[#F59E0B] border border-[#F59E0B]/30"
            style={{ background: "rgba(245, 158, 11, 0.08)" }}
          >
            <Clock size={10} strokeWidth={2.2} />
            Pendente
          </span>
        )}
      </div>
    </Link>
  );
}
