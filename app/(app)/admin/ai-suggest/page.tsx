import Link from "next/link";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  TrendingUp,
  BookOpen,
  RefreshCw,
  Target,
  Quote,
  Radio,
  Hash,
  Settings,
  Power,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getAiSuggestStats,
  listAiDrafts,
  type AiDraftFilter,
  type AiSuggestStats,
} from "@/lib/queries/ai-drafts";
import { getAiSuggestConfigResolved } from "@/lib/queries/ai-suggest-config";
import { DraftsTable } from "./drafts-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FILTER_OPTIONS: Array<{ value: AiDraftFilter; label: string }> = [
  { value: "pending", label: "Pendentes" },
  { value: "accepted", label: "Aceitos" },
  { value: "discarded", label: "Descartados" },
  { value: "all", label: "Todos" },
];

const FIELD_LABELS: Record<string, string> = {
  suggested_title: "Título",
  structure: "Estrutura",
  traffic_source: "Tráfego",
  ai_summary: "Resumo",
};

export default async function AiSuggestPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const filter = (
    ["pending", "accepted", "discarded", "all"].includes(params.f ?? "")
      ? params.f
      : "pending"
  ) as AiDraftFilter;

  const [stats, drafts, config] = await Promise.all([
    getAiSuggestStats(),
    listAiDrafts(filter, 200),
    getAiSuggestConfigResolved(),
  ]);

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em]">
            <Sparkles size={12} strokeWidth={2} />
            AI Suggest
          </div>
          <h1 className="display text-[28px] font-semibold tracking-[-0.03em] flex items-center gap-3">
            Gerenciamento de sugestões
            {stats.pending > 0 && (
              <span
                className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold"
                style={{
                  background: "color-mix(in srgb, #F59E0B 16%, transparent)",
                  color: "#F59E0B",
                }}
              >
                {stats.pending} pendente{stats.pending === 1 ? "" : "s"}
              </span>
            )}
          </h1>
          <p className="text-[13px] text-text-2 max-w-[700px]">
            GPT-4o-mini com vision gera sugestões de título, estrutura, tráfego e
            resumo. Admin revisa, aceita ou descarta. <strong>Nenhum valor é
            aplicado automaticamente</strong> — toda mudança passa pela tua aprovação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/ai-suggest/config"
            className="
              inline-flex items-center gap-2 h-9 px-4 rounded-full
              glass-light text-[13px] font-medium text-text
              hover:bg-[var(--bg-glass-hover)] transition-colors
            "
          >
            <Settings size={13} strokeWidth={1.8} />
            Configurar
          </Link>
          <form action="/admin/ai-suggest">
            {filter !== "pending" && (
              <input type="hidden" name="f" value={filter} />
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
        </div>
      </header>

      {/* Banner se feature desligada */}
      {!config.enabled && (
        <div
          className="glass rounded-[var(--r-md)] px-4 py-3 flex items-center gap-3 flex-wrap"
          style={{
            background: "color-mix(in srgb, var(--error) 6%, transparent)",
            border: "1px solid color-mix(in srgb, var(--error) 22%, transparent)",
          }}
        >
          <div
            className="w-9 h-9 rounded-full grid place-items-center shrink-0"
            style={{
              background: "color-mix(in srgb, var(--error) 14%, transparent)",
              color: "var(--error)",
            }}
          >
            <Power size={15} strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-[13px] font-semibold text-[var(--error)]">
              AI Suggest está desligado
            </span>
            <span className="text-[12px] text-text-2">
              Worker não gera sugestões novas até você religar. Drafts existentes
              continuam revisáveis.
            </span>
          </div>
          <Link
            href="/admin/ai-suggest/config"
            className="
              inline-flex items-center gap-1.5 h-8 px-3 rounded-full
              text-[12px] font-semibold text-[var(--error)]
              border border-[color-mix(in_srgb,var(--error)_28%,transparent)]
              hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]
              transition-colors shrink-0
            "
          >
            <Settings size={11} strokeWidth={2} />
            Ligar de volta
          </Link>
        </div>
      )}

      {/* Stats grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Clock size={13} strokeWidth={1.8} />}
          label="Pendentes"
          value={stats.pending.toLocaleString("pt-BR")}
          hint={
            stats.total_drafts > 0
              ? `${((stats.pending / stats.total_drafts) * 100).toFixed(0)}% do total`
              : undefined
          }
          tone={stats.pending > 10 ? "warning" : stats.pending > 0 ? "info" : "default"}
        />
        <StatCard
          icon={<CheckCircle2 size={13} strokeWidth={1.8} />}
          label="Aceitos"
          value={stats.accepted.toLocaleString("pt-BR")}
          hint={
            stats.accepted + stats.discarded > 0
              ? `${(stats.acceptance_rate * 100).toFixed(0)}% de aceitação`
              : undefined
          }
          tone="success"
        />
        <StatCard
          icon={<XCircle size={13} strokeWidth={1.8} />}
          label="Descartados"
          value={stats.discarded.toLocaleString("pt-BR")}
        />
        <StatCard
          icon={<DollarSign size={13} strokeWidth={1.8} />}
          label="Custo total"
          value={`$${stats.total_cost_usd.toFixed(3)}`}
          hint={`${(stats.total_tokens_prompt + stats.total_tokens_completion).toLocaleString("pt-BR")} tokens`}
        />
      </section>

      {/* Breakdown — 2 colunas: campos aceitos + structures sugeridas */}
      {stats.total_drafts > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldsAcceptedCard stats={stats} />
          <StructureBreakdownCard stats={stats} />
        </section>
      )}

      {/* Filter pills */}
      <section className="flex items-center gap-3 flex-wrap">
        <div
          className="inline-flex items-center gap-0.5 p-0.5 rounded-full glass-light border border-[var(--border-hairline)]"
          role="tablist"
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.value;
            const count =
              opt.value === "pending"
                ? stats.pending
                : opt.value === "accepted"
                  ? stats.accepted
                  : opt.value === "discarded"
                    ? stats.discarded
                    : stats.total_drafts;
            return (
              <Link
                key={opt.value}
                href={
                  opt.value === "pending"
                    ? "/admin/ai-suggest"
                    : `/admin/ai-suggest?f=${opt.value}`
                }
                role="tab"
                aria-selected={active}
                className={`
                  inline-flex items-center gap-1.5 px-3 h-7 rounded-full
                  text-[11px] font-medium
                  transition-colors duration-[var(--dur-2)]
                  ${
                    active
                      ? "text-text bg-[var(--bg-glass)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "text-text-3 hover:text-text-2"
                  }
                `}
              >
                {opt.label}
                <span
                  className="mono text-[10px] tabular-nums px-1 rounded"
                  style={{
                    background: active
                      ? "var(--bg-elevated)"
                      : "transparent",
                  }}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>

        {stats.last_generated_at && (
          <span className="text-[11px] text-text-3 ml-auto">
            Última sugestão gerada {formatRelative(stats.last_generated_at)}
          </span>
        )}
      </section>

      {/* Tabela */}
      <DraftsTable drafts={drafts} filter={filter} />

      {/* Footer hint */}
      <section
        className="glass-light rounded-[var(--r-md)] px-4 py-3 flex items-start gap-3 text-[12px]"
        style={{
          background: "color-mix(in srgb, var(--accent) 4%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent) 16%, transparent)",
        }}
      >
        <BookOpen
          size={14}
          strokeWidth={1.8}
          style={{ color: "var(--accent)" }}
          className="mt-0.5 shrink-0"
        />
        <div className="flex flex-col gap-1 text-text-2">
          <p className="text-text font-medium">Como isso funciona</p>
          <p className="leading-relaxed">
            Quando uma oferta recebe transcrição nova (via enrich ou re-transcribe
            manual), o worker enfileira um job <code className="mono text-[11px] px-1 rounded" style={{ background: "var(--bg-elevated)" }}>ai_authoring</code>.
            Em ~15-30s, GPT-4o-mini com vision lê transcript + screenshot e
            deixa sugestões aqui pra ti revisar.
            Custo: ~$0.003 por oferta.
          </p>
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-cards
// ─────────────────────────────────────────────────────────────

function FieldsAcceptedCard({ stats }: { stats: AiSuggestStats }) {
  const entries = Object.entries(stats.fields_accepted).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div className="glass rounded-[var(--r-lg)] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
        <TrendingUp size={12} strokeWidth={1.8} />
        Campos mais aceitos
      </div>
      {entries.length === 0 ? (
        <p className="text-[12px] text-text-3 italic">
          Nenhum campo aceito ainda. Assim que você aprovar sugestões, as mais
          populares aparecem aqui.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map(([field, count]) => {
            const max = entries[0][1];
            const pct = Math.round((count / max) * 100);
            return (
              <li key={field} className="flex items-center gap-3">
                <span className="text-[11.5px] text-text-2 min-w-[100px] flex items-center gap-1.5">
                  {fieldIcon(field)}
                  {FIELD_LABELS[field] ?? field}
                </span>
                <div className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--bg-elevated)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
                <span className="mono text-[11px] text-text-2 tabular-nums min-w-[32px] text-right">
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StructureBreakdownCard({ stats }: { stats: AiSuggestStats }) {
  const entries = Object.entries(stats.structures_suggested).sort(
    (a, b) => b[1] - a[1]
  );
  const total = entries.reduce((s, [, n]) => s + n, 0);

  return (
    <div className="glass rounded-[var(--r-lg)] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
        <Target size={12} strokeWidth={1.8} />
        Estruturas sugeridas pela IA
      </div>
      {entries.length === 0 ? (
        <p className="text-[12px] text-text-3 italic">
          Sem dados ainda.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map(([struct, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const color = {
              vsl: "#EC4899",
              quiz: "#06B6D4",
              low_ticket: "#F59E0B",
              infoproduto: "#8B5CF6",
            }[struct] ?? "var(--accent)";
            return (
              <li key={struct} className="flex items-center gap-3">
                <span className="text-[11.5px] text-text-2 min-w-[100px] capitalize">
                  {struct.replace("_", " ")}
                </span>
                <div className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--bg-elevated)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
                <span className="mono text-[11px] text-text-2 tabular-nums min-w-[56px] text-right">
                  {count} · {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────

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
  tone?: "default" | "success" | "warning" | "error" | "info";
}) {
  const color =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
        ? "#F59E0B"
        : tone === "error"
          ? "var(--error)"
          : tone === "info"
            ? "var(--accent)"
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

function fieldIcon(field: string) {
  switch (field) {
    case "suggested_title":
      return <Quote size={10} strokeWidth={1.8} className="text-text-3" />;
    case "structure":
      return <Target size={10} strokeWidth={1.8} className="text-text-3" />;
    case "traffic_source":
      return <Radio size={10} strokeWidth={1.8} className="text-text-3" />;
    case "ai_summary":
      return <Hash size={10} strokeWidth={1.8} className="text-text-3" />;
    default:
      return null;
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const day = Math.floor(hr / 24);
  return `há ${day}d`;
}
