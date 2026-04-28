import Link from "next/link";
import {
  Satellite,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  TrendingUp,
  BookOpen,
  RefreshCw,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getMetaApiStats,
  getRecentMetaApiCalls,
} from "@/lib/queries/meta-api-stats";
import { TokenCard } from "./token-card";

// ISR: re-gera a página a cada 30s ao invés de toda request.
// Botão "Atualizar" força revalidate imediato via router.refresh().
export const revalidate = 30;

export default async function MetaApiPage({
  searchParams,
}: {
  searchParams: Promise<{ hours?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const hoursBack = Math.min(
    168,
    Math.max(1, parseInt(params.hours ?? "24", 10))
  );

  const [stats, recent] = await Promise.all([
    getMetaApiStats(hoursBack),
    getRecentMetaApiCalls(60),
  ]);

  const rangeLabel =
    hoursBack === 1
      ? "última hora"
      : hoursBack === 24
      ? "últimas 24 horas"
      : hoursBack === 168
      ? "última semana"
      : `últimas ${hoursBack} horas`;

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em]">
            <Satellite size={12} strokeWidth={2} />
            Meta Ad Library API
          </div>
          <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
            Uso e performance da API
          </h1>
          <p className="text-[13px] text-text-2">
            Monitoramento de todas as chamadas ao Graph API v21.0/ads_archive —{" "}
            {rangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HourRangeFilter active={hoursBack} />
          <form action="/admin/meta-api">
            {hoursBack !== 24 && (
              <input type="hidden" name="hours" value={hoursBack} />
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

      {/* Token card — status + trocar */}
      <TokenCard />

      {/* Rate limit warning */}
      {stats.rate_limit_warn && (
        <div
          className="glass rounded-[var(--r-lg)] p-4 flex items-center gap-3"
          style={{
            borderColor: "color-mix(in srgb, #F59E0B 50%, transparent)",
            background: "color-mix(in srgb, #F59E0B 8%, transparent)",
          }}
        >
          <AlertTriangle size={16} className="text-[#F59E0B] shrink-0" />
          <div>
            <div className="text-[13px] font-semibold text-[#F59E0B]">
              ⚠️ Aproximando do limite de requisições (200/hora)
            </div>
            <div className="text-[11.5px] text-text-2 mt-0.5">
              Feitas {stats.calls_last_hour} chamadas na última hora. Meta pode
              bloquear temporariamente acima de 200.
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Satellite size={14} strokeWidth={1.8} />}
          label={`Chamadas ${hoursBack}h`}
          value={stats.total_calls.toLocaleString("pt-BR")}
          hint={`${stats.calls_last_hour} na última hora`}
        />
        <StatCard
          icon={<CheckCircle2 size={14} strokeWidth={1.8} />}
          label="Taxa de sucesso"
          value={`${(stats.success_rate * 100).toFixed(1)}%`}
          hint={`${stats.success_calls} ok · ${stats.error_calls} erro${stats.error_calls === 1 ? "" : "s"}`}
          tone={
            stats.success_rate >= 0.95
              ? "success"
              : stats.success_rate >= 0.8
              ? "warning"
              : "error"
          }
        />
        <StatCard
          icon={<Clock size={14} strokeWidth={1.8} />}
          label="Tempo médio"
          value={`${stats.avg_response_ms}ms`}
          hint={
            stats.avg_response_ms < 300
              ? "rápido"
              : stats.avg_response_ms < 1000
              ? "normal"
              : "lento"
          }
          tone={stats.avg_response_ms > 2000 ? "warning" : "default"}
        />
        <StatCard
          icon={<TrendingUp size={14} strokeWidth={1.8} />}
          label="Ads retornados"
          value={stats.total_ads_returned.toLocaleString("pt-BR")}
          hint={
            stats.total_calls > 0
              ? `~${Math.round(stats.total_ads_returned / stats.total_calls)} por chamada`
              : ""
          }
        />
      </div>

      {/* Explicação rápida */}
      <section
        className="glass rounded-[var(--r-lg)] p-4 flex items-start gap-3"
        style={{
          borderColor: "color-mix(in srgb, #06B6D4 40%, transparent)",
          background: "color-mix(in srgb, #06B6D4 5%, transparent)",
        }}
      >
        <BookOpen
          size={16}
          className="text-[#67E8F9] shrink-0 mt-0.5"
          strokeWidth={1.8}
        />
        <div className="text-[12.5px] text-text-2 leading-relaxed">
          <p>
            Cada vez que o sistema precisa saber quantos anúncios ativos uma
            Page tem (ou baixar novos criativos), faz uma chamada pra esta API.
            Limite oficial:{" "}
            <strong className="text-text">200 chamadas por hora</strong>. No
            ritmo atual, estamos em{" "}
            <strong className="text-text">
              {Math.round((stats.calls_last_hour / 200) * 100)}%
            </strong>{" "}
            da capacidade.
          </p>
        </div>
      </section>

      {/* Chamadas por handler */}
      <section className="glass rounded-[var(--r-lg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-hairline)]">
          <h2 className="display text-[16px] font-semibold tracking-[-0.01em]">
            Quem está usando a API
          </h2>
          <p className="text-[12px] text-text-3 mt-0.5">
            Detalhamento por worker que disparou as chamadas em {rangeLabel}
          </p>
        </div>
        {stats.calls_by_handler.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-text-3">
            Nenhuma chamada ainda nesse período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-3 font-semibold">
                  <th className="text-left px-5 py-2.5">Worker</th>
                  <th className="text-right px-3 py-2.5">Chamadas</th>
                  <th className="text-right px-3 py-2.5">% do total</th>
                  <th className="text-right px-5 py-2.5">Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {stats.calls_by_handler.map((h) => (
                  <tr
                    key={h.handler}
                    className="border-t border-[var(--border-hairline)]"
                  >
                    <td className="px-5 py-3 text-[13px] text-text">
                      <span className="mono text-[12px]">
                        {translateHandler(h.handler)}
                      </span>
                    </td>
                    <td className="text-right px-3 py-3 mono tabular-nums text-[13px]">
                      {h.total}
                    </td>
                    <td className="text-right px-3 py-3 mono tabular-nums text-[12px] text-text-2">
                      {((h.total / stats.total_calls) * 100).toFixed(0)}%
                    </td>
                    <td className="text-right px-5 py-3 mono tabular-nums text-[12px] text-text-2">
                      {h.avg_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top erros */}
      {stats.top_errors.length > 0 && (
        <section
          className="glass rounded-[var(--r-lg)] overflow-hidden"
          style={{ borderColor: "color-mix(in srgb, var(--error) 30%, transparent)" }}
        >
          <div
            className="px-5 py-4 border-b border-[var(--border-hairline)]"
            style={{ background: "color-mix(in srgb, var(--error) 4%, transparent)" }}
          >
            <h2 className="display text-[16px] font-semibold tracking-[-0.01em]">
              Erros mais frequentes
            </h2>
            <p className="text-[12px] text-text-3 mt-0.5">
              Agrupados por código Meta — priorize corrigir os topos
            </p>
          </div>
          <ul className="divide-y divide-[var(--border-hairline)]">
            {stats.top_errors.map((e, i) => (
              <li key={i} className="px-5 py-3 flex items-start gap-3">
                <span
                  className="mono text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    color: "var(--error)",
                    background: "color-mix(in srgb, var(--error) 12%, transparent)",
                  }}
                >
                  {e.code ?? "?"}
                  {e.subcode !== null && e.subcode !== undefined
                    ? `/${e.subcode}`
                    : ""}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] text-text">
                    {translateMetaError(e.code, e.subcode, e.message)}
                  </div>
                  <div className="text-[10.5px] text-text-3 mt-0.5 mono">
                    {e.message.slice(0, 200)}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-text-2 mono tabular-nums">
                  {e.count}x
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Chamadas recentes */}
      <section className="glass rounded-[var(--r-lg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-hairline)]">
          <h2 className="display text-[16px] font-semibold tracking-[-0.01em]">
            Últimas 60 chamadas
          </h2>
          <p className="text-[12px] text-text-3 mt-0.5">
            Cada linha é uma requisição ao endpoint da Meta
          </p>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-text-3">
            Ainda nenhuma chamada registrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-3 font-semibold">
                  <th className="text-left px-5 py-2.5">Quando</th>
                  <th className="text-left px-3 py-2.5">Query</th>
                  <th className="text-left px-3 py-2.5">Oferta</th>
                  <th className="text-right px-3 py-2.5">Ads</th>
                  <th className="text-right px-3 py-2.5">Tempo</th>
                  <th className="text-left px-5 py-2.5 w-[110px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-[var(--border-hairline)] hover:bg-[var(--bg-glass)] transition-colors"
                  >
                    <td className="px-5 py-3 mono tabular-nums text-[11px] text-text-3">
                      {formatRelative(c.created_at)}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-text-2">
                      {c.search_page_ids ? (
                        <>
                          <span className="text-text-3">page_id:</span>{" "}
                          <span className="mono">{c.search_page_ids}</span>
                        </>
                      ) : c.search_terms ? (
                        <>
                          <span className="text-text-3">domínio:</span>{" "}
                          <span className="mono">{c.search_terms}</span>
                        </>
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[11.5px]">
                      {c.offer_slug ? (
                        <Link
                          href={`/admin/offers`}
                          className="text-text-2 hover:text-text mono"
                        >
                          {c.offer_slug}
                        </Link>
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </td>
                    <td className="text-right px-3 py-3 mono tabular-nums text-[12px] text-text-2">
                      {c.ads_returned ?? 0}
                    </td>
                    <td className="text-right px-3 py-3 mono tabular-nums text-[11px] text-text-3">
                      {c.response_time_ms}ms
                    </td>
                    <td className="px-5 py-3">
                      {c.error_code || c.error_message ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
                          style={{
                            color: "var(--error)",
                            background: "color-mix(in srgb, var(--error) 12%, transparent)",
                          }}
                          title={c.error_message ?? ""}
                        >
                          <AlertTriangle size={10} />
                          Erro {c.error_code ?? ""}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
                          style={{
                            color: "var(--success)",
                            background: "color-mix(in srgb, var(--success) 12%, transparent)",
                          }}
                        >
                          <CheckCircle2 size={10} />
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const HOUR_RANGES: Array<{ value: number; label: string }> = [
  { value: 1, label: "1h" },
  { value: 24, label: "24h" },
  { value: 72, label: "3d" },
  { value: 168, label: "7d" },
];

function HourRangeFilter({ active }: { active: number }) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-full glass-light border border-[var(--border-hairline)]">
      {HOUR_RANGES.map((r) => {
        const isActive = r.value === active;
        return (
          <Link
            key={r.value}
            href={r.value === 24 ? "/admin/meta-api" : `/admin/meta-api?hours=${r.value}`}
            className={`
              px-3 h-8 grid place-items-center rounded-full
              text-[12px] font-medium mono tabular-nums
              transition-colors
              ${
                isActive
                  ? "text-text bg-[var(--bg-glass)]"
                  : "text-text-3 hover:text-text-2"
              }
            `}
          >
            {r.label}
          </Link>
        );
      })}
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

function translateHandler(h: string): string {
  const map: Record<string, string> = {
    refresh_ad_count: "Atualizar contagem de ads",
    sync_creatives: "Sincronizar criativos",
    domain_search: "Descoberta por domínio",
    discover_pages: "Descoberta de Pages",
    desconhecido: "Outros",
  };
  return map[h] ?? h;
}

function translateMetaError(
  code: number | null,
  subcode: number | null,
  msg: string
): string {
  if (code === 190 && subcode === 463) {
    return "⏰ Token de acesso expirou — precisa gerar novo";
  }
  if (code === 10 && subcode === 2332002) {
    return "👤 Conta do Meta não confirmou identidade pra Ad Library API";
  }
  if (code === 10 && subcode === 2332004) {
    return "🔒 Token não tem permissão pra acessar esses dados";
  }
  if (code === 4 || code === 17) {
    return "🚦 Limite de requisições atingido (rate limit)";
  }
  if (code === 100) {
    return "❓ Parâmetro inválido na query";
  }
  if (code === 200) {
    return "🚫 Meta bloqueou o acesso (permissão negada)";
  }
  if (code === 190) {
    return "🔑 Problema com o token de acesso";
  }
  if (msg.toLowerCase().includes("fetch failed")) {
    return "🌐 Falha de rede ao contactar Meta";
  }
  if (msg.toLowerCase().includes("timeout")) {
    return "⏱ Meta demorou demais pra responder";
  }
  return "⚠️ Erro desconhecido da API";
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s atrás`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  return new Date(iso).toLocaleString("pt-BR");
}
