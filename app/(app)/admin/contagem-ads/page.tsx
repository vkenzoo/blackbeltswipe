import Link from "next/link";
import {
  Radar,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Minus,
  RefreshCw,
  Clock,
  Flame,
  CircleSlash,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getAdCountOverview,
  getAdCountTable,
  type AdCountRow,
} from "@/lib/queries/ad-count-stats";
import { Sparkline } from "./sparkline";
import {
  RefreshStaleButton,
  RefreshOfferButton,
  BackfillHistoryButton,
} from "./actions";
import { FilterChips } from "./filter-chips";
import { formatDateShort, formatNumber } from "@/lib/utils";

export const revalidate = 30;

type FilterKey = "all" | "stale" | "zero" | "growing" | "declining";

export default async function ContagemAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: FilterKey }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filter = (params.filter ?? "all") as FilterKey;

  const [overview, rows] = await Promise.all([
    getAdCountOverview(),
    getAdCountTable({ filter, statusFilter: "active" }),
  ]);

  const cronRunLabel = overview.last_cron_run_at
    ? formatRelativeTime(overview.last_cron_run_at)
    : "nunca";

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em]">
            <Radar size={12} strokeWidth={2} />
            Contagem de Ads
          </div>
          <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
            Espionagem contínua
          </h1>
          <p className="text-[13px] text-text-2">
            Monitoramento diário de quantos anúncios cada oferta tem ativo no
            Meta Ad Library. Histórico de 30d, detecção de stale e trend.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <BackfillHistoryButton />
          <RefreshStaleButton />
          <form action="/admin/contagem-ads">
            <button
              type="submit"
              className="
                inline-flex items-center gap-2 h-9 px-4 rounded-full
                glass-light text-[13px] font-medium text-text
                hover:bg-[var(--bg-glass-hover)] transition-colors
              "
            >
              <RefreshCw size={13} strokeWidth={1.8} />
              Atualizar
            </button>
          </form>
        </div>
      </header>

      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Activity size={14} strokeWidth={1.8} />}
          label="Ofertas ativas"
          value={overview.total_active.toLocaleString("pt-BR")}
          hint={`${overview.count_zero} com 0 ads`}
        />
        <StatCard
          icon={<Flame size={14} strokeWidth={1.8} />}
          label="Total de ads"
          value={formatNumber(overview.total_ads_now)}
          hint={`pico histórico: ${formatNumber(overview.total_ads_peak)}`}
        />
        <StatCard
          icon={<TrendingUp size={14} strokeWidth={1.8} />}
          label="Em crescimento"
          value={overview.count_growing.toLocaleString("pt-BR")}
          hint={`${overview.count_declining} caindo`}
          tone={overview.count_growing > 0 ? "success" : "default"}
        />
        <StatCard
          icon={<Clock size={14} strokeWidth={1.8} />}
          label="Última rodada"
          value={cronRunLabel}
          hint={`taxa: ${(overview.success_rate_24h * 100).toFixed(0)}% · ${overview.count_stale} stale`}
          tone={
            overview.count_stale > 5
              ? "warning"
              : overview.count_stale > 0
                ? "default"
                : "success"
          }
        />
      </div>

      {/* Explainer */}
      <section
        className="glass rounded-[var(--r-lg)] p-4 flex items-start gap-3"
        style={{
          borderColor: "color-mix(in srgb, #06B6D4 40%, transparent)",
          background: "color-mix(in srgb, #06B6D4 5%, transparent)",
        }}
      >
        <Radar
          size={16}
          className="text-[#67E8F9] shrink-0 mt-0.5"
          strokeWidth={1.8}
        />
        <div className="text-[12.5px] text-text-2 leading-relaxed">
          <p>
            A cada refresh o sistema consulta o Meta Ad Library API pra cada
            Page cadastrada e guarda um snapshot. A tabela abaixo mostra{" "}
            <strong className="text-text">ad_count atual</strong>,{" "}
            <strong className="text-text">7 dias atrás</strong>,{" "}
            <strong className="text-text">pico histórico</strong> e tendência de
            30 dias. Clique em uma oferta pra ver detalhes ou use o botão de
            refresh individual pra forçar atualização imediata.
          </p>
        </div>
      </section>

      {/* Filter chips */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <FilterChips
          active={filter}
          counts={{
            all: overview.total_active,
            stale: overview.count_stale,
            zero: overview.count_zero,
            growing: overview.count_growing,
            declining: overview.count_declining,
          }}
        />
        <div className="text-[11.5px] text-text-3">
          Mostrando {rows.length} oferta{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Tabela */}
      <div className="glass rounded-[var(--r-lg)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border-hairline)]">
                <Th className="pl-4">Oferta</Th>
                <Th>Agora</Th>
                <Th>Δ 7d</Th>
                <Th>Pico</Th>
                <Th>30d</Th>
                <Th>Último refresh</Th>
                <Th>Tendência</Th>
                <Th className="pr-4 text-right">Ação</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center text-text-3 py-12 text-[13px]"
                  >
                    Nenhuma oferta corresponde ao filtro.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <OfferRow key={row.offer_id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "error";
}) {
  const toneColor =
    tone === "success"
      ? "#22C55E"
      : tone === "warning"
        ? "#F59E0B"
        : tone === "error"
          ? "#EF4444"
          : undefined;

  return (
    <div
      className="glass rounded-[var(--r-lg)] p-4 flex flex-col gap-1.5"
      style={
        toneColor
          ? {
              borderColor: `color-mix(in srgb, ${toneColor} 30%, transparent)`,
            }
          : undefined
      }
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-3 uppercase tracking-[0.12em]">
        <span style={toneColor ? { color: toneColor } : undefined}>{icon}</span>
        {label}
      </div>
      <div
        className="display text-[22px] font-semibold tracking-[-0.02em]"
        style={toneColor ? { color: toneColor } : undefined}
      >
        {value}
      </div>
      {hint && <div className="text-[11.5px] text-text-3">{hint}</div>}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left text-[11px] font-semibold text-text-3 uppercase tracking-[0.1em] px-3 py-3 ${className}`}
    >
      {children}
    </th>
  );
}

function OfferRow({ row }: { row: AdCountRow }) {
  const deltaIcon =
    row.delta_7d === null ? (
      <Minus size={12} className="text-text-3" />
    ) : row.delta_7d > 0 ? (
      <TrendingUp size={12} className="text-[#22C55E]" />
    ) : row.delta_7d < 0 ? (
      <TrendingDown size={12} className="text-[#EF4444]" />
    ) : (
      <Minus size={12} className="text-text-3" />
    );

  const deltaColor =
    row.delta_7d === null || row.delta_7d === 0
      ? "var(--text-3)"
      : row.delta_7d > 0
        ? "#22C55E"
        : "#EF4444";

  return (
    <tr className="border-b border-[var(--border-hairline)] hover:bg-[var(--bg-glass)] transition-colors">
      <td className="pl-4 py-3">
        <Link
          href={`/admin/offers/${row.offer_id}/edit`}
          className="flex flex-col gap-0.5 hover:text-text transition-colors"
        >
          <div className="font-medium text-text text-[13.5px]">{row.title}</div>
          <div className="text-[11px] text-text-3 flex items-center gap-2">
            <span>{row.slug}</span>
            {row.niche && <span>· {row.niche}</span>}
            {row.language && <span>· {row.language}</span>}
          </div>
        </Link>
      </td>
      <td className="px-3 py-3">
        <div
          className="display font-semibold text-[16px] tracking-[-0.02em]"
          style={{
            color: row.ad_count_now === 0 ? "#EF4444" : undefined,
          }}
        >
          {row.ad_count_now}
        </div>
      </td>
      <td className="px-3 py-3">
        <div
          className="inline-flex items-center gap-1 text-[12.5px] font-medium"
          style={{ color: deltaColor }}
        >
          {deltaIcon}
          {row.delta_7d === null
            ? "—"
            : row.delta_7d > 0
              ? `+${row.delta_7d}`
              : row.delta_7d}
        </div>
        {row.ad_count_7d !== null && (
          <div className="text-[10.5px] text-text-3">era {row.ad_count_7d}</div>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="text-[13px] text-text font-medium">
          {row.ad_count_peak}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="text-[12.5px] text-text-2">
          {row.ad_count_30d ?? "—"}
        </div>
      </td>
      <td className="px-3 py-3">
        {row.last_refreshed_at ? (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background: row.is_stale ? "#F59E0B" : "#22C55E",
              }}
            />
            <div className="text-[11.5px] text-text-2">
              {formatRelativeTime(row.last_refreshed_at)}
            </div>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 text-[11.5px] text-[#F59E0B]">
            <AlertTriangle size={11} strokeWidth={2} />
            nunca
          </div>
        )}
        <div className="text-[10.5px] text-text-3">
          intervalo {row.refresh_interval_hours}h
        </div>
      </td>
      <td className="px-3 py-3">
        <Sparkline data={row.sparkline} />
      </td>
      <td className="pr-4 py-3 text-right">
        <RefreshOfferButton offerId={row.offer_id} />
      </td>
    </tr>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d atrás`;
  return formatDateShort(iso);
}
