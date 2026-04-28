import Link from "next/link";
import {
  listRecentJobs,
  getWorkerStats,
  RANGE_LABELS,
  type DateRange,
} from "@/lib/queries/jobs";
import {
  formatCost,
  jobKindColor,
  jobKindLabel,
} from "@/lib/worker/cost-calculator";
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  DollarSign,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
  BookOpen,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  JobsOverTimeChart,
  CostPieChart,
} from "@/components/admin/workers-charts";
import { RetryJobButton } from "@/components/admin/retry-job-button";
import { WorkerHealthCard } from "@/components/admin/worker-health-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_RANGES: DateRange[] = ["24h", "7d", "30d", "90d"];

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const range: DateRange = VALID_RANGES.includes(params.range as DateRange)
    ? (params.range as DateRange)
    : "30d";

  const [stats, jobs] = await Promise.all([
    getWorkerStats(range),
    listRecentJobs(range, 80),
  ]);

  const runningNow = stats.byStatus.running;
  const pendingNow = stats.byStatus.pending;
  const rangeLabel = RANGE_LABELS[range];

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
            Automação em tempo real
          </h1>
          <p className="text-[13px] text-text-2">
            O que os workers estão fazendo — custos de IA e performance nos últimos{" "}
            {rangeLabel.toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/admin/guias/workers"
            className="
              inline-flex items-center gap-1.5 h-9 px-4 rounded-full
              glass-light text-[13px] font-medium text-text-2 hover:text-text
              hover:bg-[var(--bg-glass-hover)] transition-colors
              border border-[var(--border-hairline)]
            "
            title="Guia explicando o que cada worker faz"
          >
            <BookOpen size={13} strokeWidth={1.8} />
            Como funcionam?
          </Link>
          <DateRangeFilter active={range} />
          <form action="/admin/workers">
            {/* Preserva o range selecionado ao recarregar */}
            {range !== "30d" && <input type="hidden" name="range" value={range} />}
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

      {/* ── Health card (live) ── */}
      <WorkerHealthCard />

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Activity size={14} strokeWidth={1.8} />}
          label={`Tarefas processadas ${rangeLabel}`}
          value={stats.total.toLocaleString("pt-BR")}
          hint={`${runningNow} rodando agora · ${pendingNow} na fila`}
        />
        <StatCard
          icon={<Zap size={14} strokeWidth={1.8} />}
          label="Taxa de sucesso"
          value={`${(stats.successRate * 100).toFixed(1)}%`}
          hint="Concluídas sem erro"
          tone={stats.successRate < 0.9 ? "warning" : "success"}
        />
        <StatCard
          icon={<DollarSign size={14} strokeWidth={1.8} />}
          label="Gasto com IA"
          value={formatCost(stats.totalCost)}
          hint="Transcrições Whisper + GPT"
        />
        <StatCard
          icon={<DollarSign size={14} strokeWidth={1.8} />}
          label="Gasto médio por dia"
          value={formatCost(
            range === "24h"
              ? stats.totalCost
              : stats.totalCost / rangeDays(range)
          )}
          hint={
            range === "24h"
              ? "últimas 24h"
              : `projeção ~${formatCost((stats.totalCost / rangeDays(range)) * 30)}/mês se ritmo continuar`
          }
        />
      </div>

      {/* ── Charts row ── */}
      <section className="grid gap-3 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
        <div className="glass rounded-[var(--r-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center gap-2">
            <BarChart3 size={14} strokeWidth={1.8} className="text-text-3" />
            <div>
              <h2 className="display text-[14px] font-semibold tracking-[-0.01em]">
                Jobs ao longo do tempo
              </h2>
              <p className="text-[11px] text-text-3">
                {range === "24h" ? "Por hora" : "Por dia"} · empilhado por tipo
              </p>
            </div>
          </div>
          <div className="p-4">
            <JobsOverTimeChart data={stats.timeSeries} />
          </div>
        </div>

        <div className="glass rounded-[var(--r-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center gap-2">
            <PieChartIcon size={14} strokeWidth={1.8} className="text-text-3" />
            <div>
              <h2 className="display text-[14px] font-semibold tracking-[-0.01em]">
                Custo por tipo
              </h2>
              <p className="text-[11px] text-text-3">
                Total: {formatCost(stats.totalCost)}
              </p>
            </div>
          </div>
          <div className="p-4">
            <CostPieChart data={stats.costBreakdown} />
          </div>
        </div>
      </section>

      {/* ── Breakdown por kind ── */}
      <section className="glass rounded-[var(--r-lg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="display text-[16px] font-semibold tracking-[-0.01em]">
              Detalhamento por tipo de tarefa
            </h2>
            <p className="text-[12px] text-text-3 mt-0.5">
              Resumo do que cada worker fez nos últimos {rangeLabel.toLowerCase()}
            </p>
          </div>
          <Link
            href="/admin/guias/workers"
            className="text-[11.5px] text-[#67E8F9] hover:underline inline-flex items-center gap-1"
          >
            <BookOpen size={11} />
            O que cada worker faz?
          </Link>
        </div>

        {stats.byKind.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-text-3">
            Nenhuma tarefa nesse período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-3 font-semibold">
                  <th className="text-left px-5 py-2.5">Tarefa</th>
                  <th className="text-right px-3 py-2.5" title="Total de execuções">Execuções</th>
                  <th className="text-right px-3 py-2.5" title="Concluídas com sucesso">Concluídas</th>
                  <th className="text-right px-3 py-2.5" title="Falharam após retries">Erros</th>
                  <th className="text-right px-3 py-2.5" title="Rodando agora">Agora</th>
                  <th className="text-right px-3 py-2.5" title="Aguardando na fila">Na fila</th>
                  <th className="text-right px-3 py-2.5" title="Tempo médio por execução">Tempo médio</th>
                  <th className="text-right px-5 py-2.5">Gasto IA</th>
                </tr>
              </thead>
              <tbody>
                {stats.byKind.map((k) => {
                  const errRate = k.total > 0 ? k.err / k.total : 0;
                  return (
                    <tr
                      key={k.kind}
                      className="border-t border-[var(--border-hairline)] hover:bg-[var(--bg-glass)] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: jobKindColor(k.kind) }}
                            aria-hidden="true"
                          />
                          <span className="text-[13px] font-medium text-text">
                            {jobKindLabel(k.kind)}
                          </span>
                          <span className="mono text-[10.5px] text-text-3">
                            {k.kind}
                          </span>
                        </span>
                      </td>
                      <td className="text-right px-3 py-3 mono tabular-nums text-[13px] text-text">
                        {k.total.toLocaleString("pt-BR")}
                      </td>
                      <td className="text-right px-3 py-3 mono tabular-nums text-[13px] text-[var(--success)]">
                        {k.ok}
                      </td>
                      <td
                        className={`text-right px-3 py-3 mono tabular-nums text-[13px] ${
                          k.err > 0 ? "text-[var(--error)]" : "text-text-3"
                        }`}
                        title={
                          errRate > 0 ? `${(errRate * 100).toFixed(1)}% taxa de erro` : undefined
                        }
                      >
                        {k.err}
                      </td>
                      <td className="text-right px-3 py-3 mono tabular-nums text-[13px] text-text-2">
                        {k.running > 0 ? (
                          <span className="text-[#F59E0B]" title="Rodando agora">
                            {k.running}
                          </span>
                        ) : (
                          <span className="text-text-3">—</span>
                        )}
                      </td>
                      <td className="text-right px-3 py-3 mono tabular-nums text-[13px] text-text-2">
                        {k.pending > 0 ? k.pending : <span className="text-text-3">—</span>}
                      </td>
                      <td className="text-right px-3 py-3 mono tabular-nums text-[12px] text-text-2">
                        {k.avg_duration_seconds !== null
                          ? formatDuration(k.avg_duration_seconds)
                          : "—"}
                      </td>
                      <td className="text-right px-5 py-3 mono tabular-nums text-[13px] text-text font-medium">
                        {formatCost(k.total_cost_usd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Recent jobs list ── */}
      <section className="glass rounded-[var(--r-lg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
          <div>
            <h2 className="display text-[16px] font-semibold tracking-[-0.01em]">
              Últimas execuções
            </h2>
            <p className="text-[12px] text-text-3 mt-0.5">
              Cada linha é uma tarefa que o worker executou · últimas {jobs.length}
            </p>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-text-3">
            Nenhuma execução ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-3 font-semibold">
                  <th className="text-left px-5 py-2.5 w-[140px]">Tarefa</th>
                  <th className="text-left px-3 py-2.5">Oferta</th>
                  <th className="text-left px-3 py-2.5 w-[80px]">Status</th>
                  <th className="text-right px-3 py-2.5 w-[80px]">Duração</th>
                  <th className="text-right px-3 py-2.5 w-[80px]">Custo</th>
                  <th className="text-right px-5 py-2.5 w-[140px]">Quando</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr
                    key={j.id}
                    className="border-t border-[var(--border-hairline)] hover:bg-[var(--bg-glass)] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded-full border"
                        style={{
                          borderColor: `${jobKindColor(j.kind)}60`,
                          background: `${jobKindColor(j.kind)}14`,
                          color: jobKindColor(j.kind),
                        }}
                      >
                        {jobKindLabel(j.kind)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-text-2">
                      {j.offer_slug ? (
                        <Link
                          href={`/app/${j.offer_slug}`}
                          className="hover:text-text transition-colors mono"
                        >
                          {j.offer_slug}
                        </Link>
                      ) : (
                        <span className="mono text-text-3">{j.id.slice(0, 8)}</span>
                      )}
                      {j.error && (
                        <span
                          className="ml-2 text-[10.5px] text-[var(--error)] truncate inline-block max-w-[280px] align-middle"
                          title={j.error}
                        >
                          {j.error.slice(0, 60)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={j.status} />
                        {j.status === "error" && (
                          <RetryJobButton jobId={j.id} />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right mono tabular-nums text-[12px] text-text-2">
                      {j.duration_seconds !== null
                        ? formatDuration(j.duration_seconds)
                        : j.status === "running"
                        ? "—"
                        : ""}
                    </td>
                    <td
                      className="px-3 py-3 text-right mono tabular-nums text-[12px]"
                      title={j.cost_explanation + (j.cost_estimated ? " (estimado)" : "")}
                    >
                      {j.cost_usd > 0 ? (
                        <span
                          className={j.cost_estimated ? "text-text-3 italic" : "text-text-2"}
                        >
                          {formatCost(j.cost_usd)}
                          {j.cost_estimated && (
                            <span className="text-text-3 text-[10px] ml-0.5">*</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right mono tabular-nums text-[11px] text-text-3">
                      {formatRelative(j.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="text-[11px] text-text-3 -mt-2">
        <span className="inline-flex items-center gap-1">
          <span className="text-text-3">*</span> custo estimado (sem dados reais de duração/tokens)
        </span>
        <span className="mx-3">·</span>
        <span>Preços OpenAI: Whisper $0.006/min · GPT-4o-mini $0.15/1M tokens</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Date range filter
// ─────────────────────────────────────────────────────────────

function DateRangeFilter({ active }: { active: DateRange }) {
  return (
    <div
      className="
        inline-flex items-center p-0.5 rounded-full
        glass-light border border-[var(--border-hairline)]
      "
      role="tablist"
      aria-label="Filtro de período"
    >
      {VALID_RANGES.map((r) => {
        const isActive = r === active;
        return (
          <Link
            key={r}
            href={r === "30d" ? "/admin/workers" : `/admin/workers?range=${r}`}
            role="tab"
            aria-selected={isActive}
            className={`
              px-3 h-8 grid place-items-center rounded-full
              text-[12px] font-medium mono tabular-nums
              transition-colors duration-[var(--dur-2)] ease-[var(--ease-apple)]
              ${
                isActive
                  ? "text-text bg-[var(--bg-glass)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "text-text-3 hover:text-text-2"
              }
            `}
          >
            {r}
          </Link>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function rangeDays(range: DateRange): number {
  return range === "24h" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 90;
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
        style={{ color: toneColor }}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-text-3">{hint}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: "pending" | "running" | "done" | "error" }) {
  const cfg = {
    pending: { label: "Na fila", color: "var(--text-3)", icon: <Clock size={11} /> },
    running: {
      label: "Rodando",
      color: "#F59E0B",
      icon: <Activity size={11} className="animate-pulse" />,
    },
    done: { label: "Concluída", color: "var(--success)", icon: <CheckCircle2 size={11} /> },
    error: { label: "Erro", color: "var(--error)", icon: <AlertCircle size={11} /> },
  }[status];

  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded"
      style={{
        color: cfg.color,
        background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s atrás`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d atrás`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
