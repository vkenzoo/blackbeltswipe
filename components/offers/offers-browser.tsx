"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  X,
  SlidersHorizontal,
  Sparkles,
  Flame,
  Clock,
  Video,
  FileText,
  TrendingUp,
  Calendar,
  ArrowDownWideNarrow,
} from "lucide-react";
import type { Offer } from "@/lib/types";
import {
  LANGUAGE_LABELS,
  NICHE_EMOJI,
  NICHE_LABELS,
  STATUS_LABELS,
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
  type Niche,
  type Language,
  type OfferStructure,
  type TrafficSource,
  type OfferStatus,
} from "@/lib/types";
import { OfferGrid } from "./offer-grid";
import { Pagination } from "./pagination";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type SortKey = "scale" | "ads" | "newest" | "oldest";
type Period = "" | "7d" | "30d" | "90d" | "90d+";

type Filters = {
  search: string;
  niche: Niche | "";
  language: Language | "";
  structure: OfferStructure | "";
  traffic: TrafficSource | "";
  status: OfferStatus | "";
  period: Period;
  min_ads: number; // 0 = no filter
  min_score: number; // 0 = no filter
  has_vsl: boolean;
  has_transcript: boolean;
  sort: SortKey;
};

const EMPTY: Filters = {
  search: "",
  niche: "",
  language: "",
  structure: "",
  traffic: "",
  status: "",
  period: "",
  min_ads: 0,
  min_score: 0,
  has_vsl: false,
  has_transcript: false,
  sort: "scale",
};

const SORT_OPTIONS: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: "scale", label: "Escala", icon: <Flame size={11} strokeWidth={2} /> },
  { value: "ads", label: "Ad count", icon: <TrendingUp size={11} strokeWidth={2} /> },
  { value: "newest", label: "Mais recentes", icon: <Sparkles size={11} strokeWidth={2} /> },
  { value: "oldest", label: "Mais antigas", icon: <Clock size={11} strokeWidth={2} /> },
];

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "", label: "Todo período" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "90d+", label: "+ de 90 dias" },
];

const MIN_ADS_PRESETS = [0, 10, 50, 100, 500];
const MIN_SCORE_PRESETS = [0, 30, 50, 70, 85];

const selectStyle = `
  h-9 px-3 pr-8 text-[12px] font-medium
  glass-light rounded-full
  text-text appearance-none cursor-pointer
  bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23A1A1A6%22 stroke-width=%221.8%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]
  bg-no-repeat bg-[right_12px_center]
  hover:bg-[var(--bg-glass-hover)]
  transition-colors
`;

// ─────────────────────────────────────────────────────────────
// URL state helpers
// ─────────────────────────────────────────────────────────────

function filtersFromParams(sp: URLSearchParams): Filters {
  return {
    search: sp.get("q") ?? "",
    niche: (sp.get("niche") ?? "") as Niche | "",
    language: (sp.get("lang") ?? "") as Language | "",
    structure: (sp.get("structure") ?? "") as OfferStructure | "",
    traffic: (sp.get("traffic") ?? "") as TrafficSource | "",
    status: (sp.get("status") ?? "") as OfferStatus | "",
    period: (sp.get("period") ?? "") as Period,
    min_ads: Number(sp.get("min_ads") ?? "0") || 0,
    min_score: Number(sp.get("min_score") ?? "0") || 0,
    has_vsl: sp.get("has_vsl") === "1",
    has_transcript: sp.get("has_transcript") === "1",
    sort: (sp.get("sort") as SortKey) ?? "scale",
  };
}

function filtersToParams(f: Filters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.search) sp.set("q", f.search);
  if (f.niche) sp.set("niche", f.niche);
  if (f.language) sp.set("lang", f.language);
  if (f.structure) sp.set("structure", f.structure);
  if (f.traffic) sp.set("traffic", f.traffic);
  if (f.status) sp.set("status", f.status);
  if (f.period) sp.set("period", f.period);
  if (f.min_ads > 0) sp.set("min_ads", String(f.min_ads));
  if (f.min_score > 0) sp.set("min_score", String(f.min_score));
  if (f.has_vsl) sp.set("has_vsl", "1");
  if (f.has_transcript) sp.set("has_transcript", "1");
  if (f.sort !== "scale") sp.set("sort", f.sort);
  return sp;
}

// ─────────────────────────────────────────────────────────────
// Search result metadata — usada pra badge "match em transcrição"
// ─────────────────────────────────────────────────────────────

type MatchInfo = {
  offer: Offer;
  match_in_transcript: boolean;
};

function periodToDateCutoff(p: Period): { after?: Date; before?: Date } {
  const now = Date.now();
  const day = 86_400_000;
  switch (p) {
    case "7d":
      return { after: new Date(now - 7 * day) };
    case "30d":
      return { after: new Date(now - 30 * day) };
    case "90d":
      return { after: new Date(now - 90 * day) };
    case "90d+":
      return { before: new Date(now - 90 * day) };
    default:
      return {};
  }
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function OffersBrowser({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Estado filtra inicializa da URL
  const [filters, setFilters] = useState<Filters>(() =>
    filtersFromParams(new URLSearchParams(searchParams?.toString() ?? ""))
  );
  // Debounce do campo de busca pra não re-filtrar a cada tecla
  const [searchInput, setSearchInput] = useState(filters.search);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [perPage, setPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce — 200ms após última tecla, commit pro filters
  useEffect(() => {
    const h = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilters((prev) => ({ ...prev, search: searchInput }));
        setCurrentPage(1);
      }
    }, 200);
    return () => clearTimeout(h);
  }, [searchInput, filters.search]);

  // Sync filters → URL
  useEffect(() => {
    const sp = filtersToParams(filters);
    const qs = sp.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    // Usar replace pra não encher o history
    router.replace(url, { scroll: false });
  }, [filters, router]);

  const update = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }, []);

  const clear = useCallback(() => {
    setFilters(EMPTY);
    setSearchInput("");
    setCurrentPage(1);
  }, []);

  // ── Aplicação dos filtros + sort ──
  const results = useMemo<MatchInfo[]>(() => {
    const search = filters.search.trim().toLowerCase();
    const { after, before } = periodToDateCutoff(filters.period);

    const filtered: MatchInfo[] = [];

    for (const o of offers) {
      // Dropdown filters
      if (filters.niche && o.niche !== filters.niche) continue;
      if (filters.language && o.language !== filters.language) continue;
      if (filters.structure && o.structure !== filters.structure) continue;
      if (filters.traffic && o.traffic_source !== filters.traffic) continue;
      if (filters.status && o.status !== filters.status) continue;

      // Ranges
      if (filters.min_ads > 0 && (o.ad_count ?? 0) < filters.min_ads) continue;
      if (filters.min_score > 0 && (o.scale_score ?? 0) < filters.min_score)
        continue;

      // Toggles
      if (filters.has_vsl && !o.vsl_storage_path) continue;
      if (filters.has_transcript && !o.transcript_text && !o.transcript_preview)
        continue;

      // Período (usa launched_at como principal, fallback created_at)
      const launch = o.launched_at ? new Date(o.launched_at) : null;
      if (launch) {
        if (after && launch < after) continue;
        if (before && launch > before) continue;
      }

      // Busca textual — título + slug + nicho + transcrição
      let match_in_transcript = false;
      if (search) {
        const baseHaystack = `${o.title} ${o.slug} ${NICHE_LABELS[o.niche]}`.toLowerCase();
        const txHaystack = `${o.transcript_preview ?? ""} ${
          o.transcript_text ?? ""
        }`.toLowerCase();
        const matchBase = baseHaystack.includes(search);
        const matchTx = txHaystack.includes(search);
        if (!matchBase && !matchTx) continue;
        match_in_transcript = !matchBase && matchTx;
      }

      filtered.push({ offer: o, match_in_transcript });
    }

    // Sort
    filtered.sort((a, b) => {
      const A = a.offer;
      const B = b.offer;
      switch (filters.sort) {
        case "ads":
          return (B.ad_count ?? 0) - (A.ad_count ?? 0);
        case "newest":
          return (
            new Date(B.launched_at ?? B.created_at ?? 0).getTime() -
            new Date(A.launched_at ?? A.created_at ?? 0).getTime()
          );
        case "oldest":
          return (
            new Date(A.launched_at ?? A.created_at ?? 0).getTime() -
            new Date(B.launched_at ?? B.created_at ?? 0).getTime()
          );
        case "scale":
        default:
          return (
            (B.scale_score ?? 0) - (A.scale_score ?? 0) ||
            (B.ad_count ?? 0) - (A.ad_count ?? 0)
          );
      }
    });

    return filtered;
  }, [offers, filters]);

  // Contagem de filtros ativos (pra chip "Limpar (N)")
  const activeChips = useMemo(() => {
    const chips: {
      key: string;
      label: string;
      onClear: () => void;
    }[] = [];
    if (filters.search) {
      chips.push({
        key: "search",
        label: `"${filters.search}"`,
        onClear: () => {
          setSearchInput("");
          update("search", "");
        },
      });
    }
    if (filters.niche)
      chips.push({
        key: "niche",
        label: `${NICHE_EMOJI[filters.niche]} ${NICHE_LABELS[filters.niche]}`,
        onClear: () => update("niche", ""),
      });
    if (filters.language)
      chips.push({
        key: "language",
        label: `${LANGUAGE_LABELS[filters.language].flag} ${LANGUAGE_LABELS[filters.language].label.replace(/\s*\([^)]*\)/, "")}`,
        onClear: () => update("language", ""),
      });
    if (filters.structure)
      chips.push({
        key: "structure",
        label: STRUCTURE_LABELS[filters.structure],
        onClear: () => update("structure", ""),
      });
    if (filters.traffic)
      chips.push({
        key: "traffic",
        label: TRAFFIC_LABELS[filters.traffic],
        onClear: () => update("traffic", ""),
      });
    if (filters.status)
      chips.push({
        key: "status",
        label: STATUS_LABELS[filters.status],
        onClear: () => update("status", ""),
      });
    if (filters.period)
      chips.push({
        key: "period",
        label: PERIOD_OPTIONS.find((p) => p.value === filters.period)?.label ?? "",
        onClear: () => update("period", ""),
      });
    if (filters.min_ads > 0)
      chips.push({
        key: "min_ads",
        label: `≥ ${filters.min_ads} ads`,
        onClear: () => update("min_ads", 0),
      });
    if (filters.min_score > 0)
      chips.push({
        key: "min_score",
        label: `score ≥ ${filters.min_score}`,
        onClear: () => update("min_score", 0),
      });
    if (filters.has_vsl)
      chips.push({
        key: "has_vsl",
        label: "Com VSL",
        onClear: () => update("has_vsl", false),
      });
    if (filters.has_transcript)
      chips.push({
        key: "has_transcript",
        label: "Com transcrição",
        onClear: () => update("has_transcript", false),
      });
    return chips;
  }, [filters, update]);

  // Quantos matches foram em transcrição (pra dica acima do grid)
  const transcriptMatches = filters.search
    ? results.filter((r) => r.match_in_transcript).length
    : 0;

  const totalPages = Math.max(1, Math.ceil(results.length / perPage));
  const paged = results
    .slice((currentPage - 1) * perPage, currentPage * perPage)
    .map((r) => r.offer);

  return (
    <>
      {/* ─── Linha principal de filtros ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search
            size={13}
            strokeWidth={1.8}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar título, nicho, transcrição..."
            className="
              w-64 h-9 pl-8 pr-3
              text-[13px]
              glass-light rounded-full
              text-text placeholder:text-text-3
              transition-[border-color,background] duration-200
              hover:bg-[var(--bg-glass-hover)]
              focus:outline-none focus:border-[var(--accent)]
            "
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                update("search", "");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text p-1"
              aria-label="Limpar busca"
            >
              <X size={11} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Niche */}
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

        {/* Language */}
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

        {/* Sort */}
        <div
          className="inline-flex items-center gap-1 h-9 px-1 rounded-full glass-light border border-[var(--border-hairline)]"
          role="tablist"
          aria-label="Ordenação"
        >
          <ArrowDownWideNarrow
            size={12}
            strokeWidth={1.8}
            className="text-text-3 ml-2"
          />
          {SORT_OPTIONS.map((s) => {
            const active = filters.sort === s.value;
            return (
              <button
                key={s.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => update("sort", s.value)}
                className={`
                  inline-flex items-center gap-1 px-2.5 h-7 rounded-full
                  text-[11px] font-medium
                  transition-colors duration-[var(--dur-2)]
                  ${
                    active
                      ? "text-text bg-[var(--bg-glass)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "text-text-3 hover:text-text-2"
                  }
                `}
              >
                {s.icon}
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className={`
            inline-flex items-center gap-1.5 h-9 px-3 rounded-full
            text-[12px] font-medium
            transition-colors
            ${
              showAdvanced
                ? "text-text bg-[var(--bg-glass)] border border-[var(--border-strong)]"
                : "text-text-2 glass-light hover:bg-[var(--bg-glass-hover)]"
            }
          `}
        >
          <SlidersHorizontal size={12} strokeWidth={1.8} />
          Avançado
          {(filters.period ||
            filters.min_ads > 0 ||
            filters.min_score > 0 ||
            filters.has_vsl ||
            filters.has_transcript ||
            filters.structure ||
            filters.traffic ||
            filters.status) && (
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-semibold"
              style={{
                background: "var(--accent)",
                color: "black",
              }}
            >
              •
            </span>
          )}
        </button>

        <div className="flex-1" />

        {/* Per page */}
        <select
          value={perPage}
          onChange={(e) => {
            setPerPage(Number(e.target.value));
            setCurrentPage(1);
          }}
          className={selectStyle}
        >
          <option value={20}>20 por página</option>
          <option value={40}>40 por página</option>
          <option value={60}>60 por página</option>
        </select>
      </div>

      {/* ─── Painel avançado (toggle) ─── */}
      {showAdvanced && (
        <div className="glass rounded-[var(--r-lg)] p-4 flex flex-col gap-4 animate-[soft-reveal_0.28s_ease-out]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Period */}
            <FilterBlock label="Período de lançamento" icon={<Calendar size={11} />}>
              <div className="flex flex-wrap gap-1.5">
                {PERIOD_OPTIONS.map((p) => (
                  <PillButton
                    key={p.value}
                    active={filters.period === p.value}
                    onClick={() => update("period", p.value)}
                  >
                    {p.label}
                  </PillButton>
                ))}
              </div>
            </FilterBlock>

            {/* Min ads */}
            <FilterBlock
              label={`Mínimo de ads${filters.min_ads > 0 ? ` (≥ ${filters.min_ads})` : ""}`}
              icon={<TrendingUp size={11} />}
            >
              <div className="flex flex-wrap gap-1.5">
                {MIN_ADS_PRESETS.map((n) => (
                  <PillButton
                    key={n}
                    active={filters.min_ads === n}
                    onClick={() => update("min_ads", n)}
                  >
                    {n === 0 ? "Qualquer" : `≥ ${n}`}
                  </PillButton>
                ))}
              </div>
            </FilterBlock>

            {/* Min score */}
            <FilterBlock
              label={`Score mínimo${filters.min_score > 0 ? ` (≥ ${filters.min_score})` : ""}`}
              icon={<Flame size={11} />}
            >
              <div className="flex flex-wrap gap-1.5">
                {MIN_SCORE_PRESETS.map((n) => (
                  <PillButton
                    key={n}
                    active={filters.min_score === n}
                    onClick={() => update("min_score", n)}
                  >
                    {n === 0 ? "Qualquer" : `≥ ${n}`}
                  </PillButton>
                ))}
              </div>
            </FilterBlock>

            {/* Structure */}
            <FilterBlock label="Estrutura">
              <select
                value={filters.structure}
                onChange={(e) =>
                  update("structure", e.target.value as OfferStructure | "")
                }
                className={selectStyle + " w-full"}
              >
                <option value="">Todas</option>
                {Object.entries(STRUCTURE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </FilterBlock>

            {/* Traffic */}
            <FilterBlock label="Tráfego">
              <select
                value={filters.traffic}
                onChange={(e) =>
                  update("traffic", e.target.value as TrafficSource | "")
                }
                className={selectStyle + " w-full"}
              >
                <option value="">Todo</option>
                {Object.entries(TRAFFIC_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </FilterBlock>

            {/* Status */}
            <FilterBlock label="Status">
              <select
                value={filters.status}
                onChange={(e) =>
                  update("status", e.target.value as OfferStatus | "")
                }
                className={selectStyle + " w-full"}
              >
                <option value="">Todos</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </FilterBlock>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border-hairline)]">
            <ToggleButton
              active={filters.has_vsl}
              onClick={() => update("has_vsl", !filters.has_vsl)}
              icon={<Video size={11} strokeWidth={1.8} />}
            >
              Com VSL baixado
            </ToggleButton>
            <ToggleButton
              active={filters.has_transcript}
              onClick={() => update("has_transcript", !filters.has_transcript)}
              icon={<FileText size={11} strokeWidth={1.8} />}
            >
              Com transcrição
            </ToggleButton>
          </div>
        </div>
      )}

      {/* ─── Chips de filtros ativos ─── */}
      {activeChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap -mt-2">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className="
                group inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full
                text-[11px] font-medium text-text
                glass-light hover:bg-[var(--bg-glass-hover)]
                border border-[var(--border-hairline)]
                transition-colors
              "
              title={`Remover ${chip.label}`}
            >
              {chip.label}
              <X
                size={10}
                strokeWidth={2}
                className="text-text-3 group-hover:text-[var(--error)] transition-colors"
              />
            </button>
          ))}
          {activeChips.length > 1 && (
            <button
              type="button"
              onClick={clear}
              className="
                inline-flex items-center gap-1 h-7 px-2.5 rounded-full
                text-[11px] font-medium text-[var(--error)]
                hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]
                transition-colors
              "
            >
              <X size={10} strokeWidth={2} />
              Limpar tudo
            </button>
          )}
        </div>
      )}

      {/* ─── Results counter ─── */}
      {(activeChips.length > 0 || filters.sort !== "scale") && (
        <div className="text-[12px] text-text-3 -mt-2 flex items-center gap-2 flex-wrap">
          <span>
            <strong className="text-text-2 font-semibold">{results.length}</strong>{" "}
            {results.length === 1 ? "oferta" : "ofertas"} encontrada
            {results.length === 1 ? "" : "s"}
            {results.length !== offers.length && ` de ${offers.length} total`}
          </span>
          {transcriptMatches > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-medium"
              style={{
                color: "var(--accent)",
                background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              }}
              title="Ofertas onde a busca bateu em transcrição (texto do VSL)"
            >
              <FileText size={9} strokeWidth={2} />
              {transcriptMatches} match em transcrição
            </span>
          )}
        </div>
      )}

      {/* ─── Grid ou empty state ─── */}
      {paged.length > 0 ? (
        <OfferGrid offers={paged} />
      ) : (
        <div className="glass rounded-[var(--r-lg)] p-12 text-center">
          <p className="text-[14px] text-text-2">
            {offers.length === 0
              ? "Nenhuma oferta ativa no momento. Aguarde enquanto o time cura novas ofertas pra você."
              : "Nenhuma oferta bate com os filtros atuais."}
          </p>
          {activeChips.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="mt-3 text-[12px] text-[var(--accent)] hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* ─── Pagination ─── */}
      {totalPages > 1 && (
        <div className="pt-4 flex justify-center">
          <Pagination
            current={currentPage}
            total={totalPages}
            onChange={setCurrentPage}
          />
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────

function FilterBlock({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
        {icon && <span className="text-text-3">{icon}</span>}
        {label}
      </div>
      {children}
    </div>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-2.5 h-7 rounded-full text-[11px] font-medium
        transition-colors duration-[var(--dur-2)]
        ${
          active
            ? "text-text bg-[var(--bg-glass)] border border-[var(--border-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            : "text-text-3 glass-light hover:text-text-2 hover:bg-[var(--bg-glass-hover)] border border-transparent"
        }
      `}
    >
      {children}
    </button>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium
        transition-all
        ${
          active
            ? "text-[var(--accent)]"
            : "text-text-2 hover:text-text"
        }
      `}
      style={
        active
          ? {
              background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
            }
          : {
              background: "var(--bg-glass)",
              border: "1px solid var(--border-hairline)",
            }
      }
    >
      {icon}
      {children}
      {active && (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
      )}
    </button>
  );
}
