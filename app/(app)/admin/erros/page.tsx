import Link from "next/link";
import {
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  Activity,
  Clock,
  ArrowRight,
  ChevronDown,
  ShieldAlert,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getErrorReports,
  type ErrorGroup,
} from "@/lib/queries/error-reports";

// ISR: revalida a cada 60s. Erros não precisam ser tempo real estrito —
// se spike crítico, botão "Atualizar" força revalidate.
export const revalidate = 60;

const RANGE_OPTIONS = [
  { value: "24", label: "24h" },
  { value: "72", label: "3 dias" },
  { value: "168", label: "7 dias" },
  { value: "720", label: "30 dias" },
] as const;

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--error)",
  high: "#F59E0B",
  medium: "#EAB308",
  low: "#06B6D4",
};

export default async function ErrosPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; sev?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const hoursBack = Number(params.range ?? "168");
  const sevFilter = params.sev ?? "all";

  const summary = await getErrorReports(
    isNaN(hoursBack) ? 168 : Math.min(Math.max(hoursBack, 1), 720)
  );

  const filteredGroups = summary.groups.filter(
    (g) => sevFilter === "all" || g.severity === sevFilter
  );

  const bySeverity = summary.groups.reduce(
    (acc, g) => {
      acc[g.severity] = (acc[g.severity] ?? 0) + g.count;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>
  );

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
            Erros do Sistema
          </h1>
          <p className="text-[13px] text-text-2">
            Tudo que deu errado, explicado em português simples — com sugestão
            do que fazer pra resolver cada um.
          </p>
        </div>
        <form action="/admin/erros">
          {params.range && (
            <input type="hidden" name="range" value={params.range} />
          )}
          {sevFilter !== "all" && (
            <input type="hidden" name="sev" value={sevFilter} />
          )}
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
      </header>

      {/* Top-level stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<AlertCircle size={14} strokeWidth={1.8} />}
          label="Erros totais"
          value={summary.total_errors.toLocaleString("pt-BR")}
          hint={`${summary.groups.length} tipos distintos`}
          tone={summary.total_errors > 50 ? "error" : summary.total_errors > 10 ? "warning" : "default"}
        />
        <StatCard
          icon={<Clock size={14} strokeWidth={1.8} />}
          label="Erros 24h"
          value={summary.errors_24h.toLocaleString("pt-BR")}
          tone={summary.errors_24h > 20 ? "error" : summary.errors_24h > 5 ? "warning" : "default"}
        />
        <StatCard
          icon={<ShieldAlert size={14} strokeWidth={1.8} />}
          label="Críticos"
          value={bySeverity.critical.toLocaleString("pt-BR")}
          tone={bySeverity.critical > 0 ? "error" : "default"}
        />
        <StatCard
          icon={<TrendingUp size={14} strokeWidth={1.8} />}
          label="Altos"
          value={bySeverity.high.toLocaleString("pt-BR")}
          tone={bySeverity.high > 5 ? "warning" : "default"}
        />
      </section>

      {/* Filters */}
      <section className="flex items-center gap-3 flex-wrap">
        <div
          className="inline-flex items-center gap-0.5 p-0.5 rounded-full glass-light border border-[var(--border-hairline)]"
          role="tablist"
          aria-label="Período"
        >
          {RANGE_OPTIONS.map((r) => {
            const active = (params.range ?? "168") === r.value;
            const qs = new URLSearchParams();
            qs.set("range", r.value);
            if (sevFilter !== "all") qs.set("sev", sevFilter);
            return (
              <Link
                key={r.value}
                href={`/admin/erros?${qs.toString()}`}
                role="tab"
                aria-selected={active}
                className={`
                  px-3 h-7 grid place-items-center rounded-full
                  text-[11px] font-medium
                  transition-colors duration-[var(--dur-2)] ease-[var(--ease-apple)]
                  ${
                    active
                      ? "text-text bg-[var(--bg-glass)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "text-text-3 hover:text-text-2"
                  }
                `}
              >
                {r.label}
              </Link>
            );
          })}
        </div>

        <div
          className="inline-flex items-center gap-0.5 p-0.5 rounded-full glass-light border border-[var(--border-hairline)]"
          role="tablist"
          aria-label="Severidade"
        >
          {["all", "critical", "high", "medium", "low"].map((s) => {
            const active = sevFilter === s;
            const qs = new URLSearchParams();
            if (params.range) qs.set("range", params.range);
            if (s !== "all") qs.set("sev", s);
            return (
              <Link
                key={s}
                href={qs.toString() ? `/admin/erros?${qs.toString()}` : "/admin/erros"}
                role="tab"
                aria-selected={active}
                className={`
                  px-2.5 h-7 grid place-items-center rounded-full
                  text-[11px] font-medium
                  transition-colors duration-[var(--dur-2)]
                  ${
                    active
                      ? "text-text bg-[var(--bg-glass)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "text-text-3 hover:text-text-2"
                  }
                `}
              >
                {s === "all" ? "Todas" : SEVERITY_LABEL[s]}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Groups */}
      {filteredGroups.length === 0 ? (
        <section className="glass rounded-[var(--r-lg)] py-12 flex flex-col items-center gap-3">
          <div
            className="w-12 h-12 rounded-full grid place-items-center"
            style={{ background: "color-mix(in srgb, var(--success) 14%, transparent)" }}
          >
            <CheckCircle2
              size={24}
              strokeWidth={1.8}
              style={{ color: "var(--success)" }}
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <h2 className="display text-[18px] font-semibold text-text">
              Nenhum erro no período
            </h2>
            <p className="text-[13px] text-text-3 text-center max-w-md">
              {sevFilter !== "all"
                ? "Nenhum erro dessa severidade encontrado. Tenta ampliar o filtro."
                : "Tudo rodando redondo. Se algum worker falhar ou a Meta API rejeitar algo, aparece aqui."}
            </p>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          {filteredGroups.map((g) => (
            <ErrorCard key={g.id} g={g} />
          ))}
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ErrorCard
// ─────────────────────────────────────────────────────────────

function ErrorCard({ g }: { g: ErrorGroup }) {
  const color = SEVERITY_COLOR[g.severity];

  return (
    <details className="glass rounded-[var(--r-lg)] overflow-hidden group">
      <summary
        className="
          list-none cursor-pointer
          px-5 py-4 flex items-center gap-4
          hover:bg-[var(--bg-glass-hover)] transition-colors
        "
      >
        {/* Severity indicator */}
        <div
          className="w-9 h-9 rounded-full grid place-items-center shrink-0"
          style={{
            background: `color-mix(in srgb, ${color} 16%, transparent)`,
            color,
          }}
        >
          <AlertTriangle size={16} strokeWidth={1.8} />
        </div>

        {/* Title + explanation */}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-text">
              {g.title}
            </span>
            <span
              className="inline-flex items-center text-[10.5px] font-medium px-1.5 py-0.5 rounded"
              style={{
                color,
                background: `color-mix(in srgb, ${color} 14%, transparent)`,
              }}
            >
              {SEVERITY_LABEL[g.severity]}
            </span>
            {g.dimension && (
              <span className="mono text-[10.5px] text-text-3">
                {g.dimension}
              </span>
            )}
          </div>
          <p className="text-[12.5px] text-text-2 leading-relaxed line-clamp-2 group-open:line-clamp-none">
            {g.explanation}
          </p>
        </div>

        {/* Count + time */}
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="display text-[18px] font-semibold tabular-nums" style={{ color }}>
            {g.count}×
          </span>
          <span className="mono text-[10.5px] text-text-3 tabular-nums">
            {formatRelative(g.last_seen)}
          </span>
        </div>

        <ChevronDown
          size={16}
          strokeWidth={1.8}
          className="text-text-3 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>

      {/* Expanded body */}
      <div className="px-5 py-4 border-t border-[var(--border-hairline)] flex flex-col gap-4">
        {/* Action hint */}
        <div
          className="flex items-start gap-2 rounded-[var(--r-md)] px-3 py-2"
          style={{
            background: `color-mix(in srgb, ${color} 6%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 18%, transparent)`,
          }}
        >
          <ArrowRight
            size={14}
            strokeWidth={2}
            className="mt-0.5 shrink-0"
            style={{ color }}
          />
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color }}>
              O que fazer
            </div>
            <p className="text-[12.5px] text-text leading-relaxed">{g.action_hint}</p>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11.5px]">
          <MetaCell
            label="Primeira ocorrência"
            value={formatDateTime(g.first_seen)}
          />
          <MetaCell
            label="Última ocorrência"
            value={formatDateTime(g.last_seen)}
          />
          <MetaCell
            label="Fonte"
            value={g.source === "jobs" ? "Worker" : "Meta API"}
          />
          <MetaCell
            label="Ocorrências"
            value={`${g.count}×`}
            valueColor={color}
          />
        </div>

        {/* Sample offers */}
        {g.sample_offers && g.sample_offers.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] uppercase tracking-wider text-text-3 font-semibold">
              Ofertas afetadas
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {g.sample_offers.map((slug) => (
                <Link
                  key={slug}
                  href={`/app/${slug}`}
                  className="
                    mono text-[11px] text-text-2 px-2 py-0.5 rounded
                    bg-[var(--bg-elevated)]
                    hover:text-text hover:bg-[var(--bg-glass-hover)]
                    transition-colors
                  "
                >
                  {slug}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Raw sample */}
        {g.sample_message && (
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] uppercase tracking-wider text-text-3 font-semibold">
              Mensagem técnica original
            </div>
            <pre
              className="
                mono text-[11px] text-text-3 px-3 py-2 rounded
                bg-[var(--bg-elevated)] border border-[var(--border-hairline)]
                whitespace-pre-wrap break-all
                max-h-32 overflow-y-auto
              "
            >
              {g.sample_message}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────

function MetaCell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] uppercase tracking-wider text-text-3 font-semibold">
        {label}
      </span>
      <span
        className="mono tabular-nums text-text font-medium"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
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
  const color =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
      ? "#F59E0B"
      : tone === "error"
      ? "var(--error)"
      : "var(--text)";

  return (
    <div className="glass rounded-[var(--r-lg)] p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
        <span className="text-text-3">{icon}</span>
        {label}
      </div>
      <div
        className="display text-[22px] font-semibold tracking-[-0.02em] mt-0.5"
        style={{ color }}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-text-3">{hint}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d atrás`;
  if (day < 30) return `${Math.floor(day / 7)}sem atrás`;
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
