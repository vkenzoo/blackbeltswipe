"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Heart,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  BookOpen,
} from "lucide-react";

type WorkerInfo = {
  worker_id: string;
  running: boolean;
  status: "healthy" | "stale" | "dead";
  last_beat_age_seconds: number;
  uptime_human: string;
  pid: number | null;
  jobs_processed: number;
  jobs_errored: number;
  browser_jobs_since_launch: number | null;
  running_counts: Record<string, number>;
};

type HealthData = {
  status: "healthy" | "stale" | "unknown";
  workers_count: number;
  any_running: boolean;
  jobs_1h: { done: number; error: number; pending: number; running: number };
  last_job_started_at: string | null;
  last_job_finished_at: string | null;
  checked_at: string;
  workers: WorkerInfo[];
};

/**
 * Card de saúde do worker em linguagem amigável pra admins leigos.
 *
 * Diferença vs versão anterior:
 *   - Destaca APENAS o worker atualmente ativo (os healthy)
 *   - Esconde instâncias antigas em accordion ("histórico")
 *   - Traduz labels técnicos (done/error/running/pending → concluídos/erros/rodando/aguardando)
 *   - Contextualiza status: "Rodando normal" em vez de "HEALTHY"
 *   - Link pro guia explicativo
 */
export function WorkerHealthCard() {
  const [data, setData] = useState<HealthData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  async function fetchHealth() {
    try {
      const res = await fetch("/api/worker/health", { cache: "no-store" });
      if (!res.ok) {
        setErr(`erro ${res.status}`);
        return;
      }
      const json = (await res.json()) as HealthData;
      setData(json);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    fetchHealth();
    const t = setInterval(fetchHealth, 15_000);
    return () => clearInterval(t);
  }, []);

  if (!data && !err) {
    return (
      <div className="glass rounded-[var(--r-lg)] p-4 flex items-center gap-2">
        <Activity size={14} className="animate-pulse text-text-3" />
        <span className="text-[13px] text-text-3">
          Verificando status do sistema de automação...
        </span>
      </div>
    );
  }

  if (err) {
    return (
      <div
        className="glass rounded-[var(--r-lg)] p-4 flex items-center gap-2"
        style={{
          background: "color-mix(in srgb, var(--error) 8%, transparent)",
          borderColor: "var(--error)",
        }}
      >
        <AlertTriangle size={14} className="text-[var(--error)]" />
        <span className="text-[13px] text-[var(--error)]">
          Não consegui verificar o status: {err}
        </span>
      </div>
    );
  }

  const d = data!;
  const activeWorkers = d.workers.filter((w) => w.running);
  const historicalWorkers = d.workers.filter((w) => !w.running);

  const primaryStatus = activeWorkers.length > 0 ? "healthy" : "down";

  const statusColor =
    primaryStatus === "healthy" ? "var(--success)" : "var(--error)";

  const statusTitle =
    primaryStatus === "healthy"
      ? "Sistema de automação rodando normal"
      : "⚠️ Nenhum worker ativo — sistema parado";

  const statusDesc =
    primaryStatus === "healthy"
      ? `${activeWorkers.length} processo${activeWorkers.length === 1 ? "" : "s"} ativo${activeWorkers.length === 1 ? "" : "s"} · última verificação ${formatRelative(d.checked_at)}`
      : "Pode ter crashado ou sido desligado. Reinicie o worker no servidor.";

  return (
    <section
      className="glass rounded-[var(--r-lg)] overflow-hidden"
      style={{
        borderColor: `color-mix(in srgb, ${statusColor} 40%, transparent)`,
      }}
    >
      {/* Header do status */}
      <div
        className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between flex-wrap gap-3"
        style={{
          background: `color-mix(in srgb, ${statusColor} 6%, transparent)`,
        }}
      >
        <div className="flex items-center gap-2.5">
          {primaryStatus === "healthy" ? (
            <CheckCircle2
              size={18}
              strokeWidth={2}
              style={{ color: statusColor }}
            />
          ) : (
            <AlertTriangle
              size={18}
              strokeWidth={2}
              style={{ color: statusColor }}
            />
          )}
          <div>
            <h2
              className="display text-[15px] font-semibold tracking-[-0.01em]"
              style={{ color: statusColor }}
            >
              {statusTitle}
            </h2>
            <p className="text-[11px] text-text-3 mt-0.5">{statusDesc}</p>
          </div>
        </div>

        {/* Resumo última hora em PT */}
        <div className="flex items-center gap-3 text-[11.5px] flex-wrap">
          {d.jobs_1h.done > 0 && (
            <span className="inline-flex items-center gap-1 text-[var(--success)]">
              <span className="mono tabular-nums font-semibold">
                {d.jobs_1h.done}
              </span>{" "}
              concluídas
            </span>
          )}
          {d.jobs_1h.running > 0 && (
            <span className="inline-flex items-center gap-1 text-[#F59E0B]">
              <Activity size={10} className="animate-pulse" />
              <span className="mono tabular-nums font-semibold">
                {d.jobs_1h.running}
              </span>{" "}
              rodando agora
            </span>
          )}
          {d.jobs_1h.pending > 0 && (
            <span className="inline-flex items-center gap-1 text-text-3">
              <Clock size={10} />
              <span className="mono tabular-nums font-semibold">
                {d.jobs_1h.pending}
              </span>{" "}
              aguardando
            </span>
          )}
          {d.jobs_1h.error > 0 && (
            <span className="inline-flex items-center gap-1 text-[var(--error)]">
              <span className="mono tabular-nums font-semibold">
                {d.jobs_1h.error}
              </span>{" "}
              com erro
            </span>
          )}
          <span className="text-text-3 text-[10.5px]">· última hora</span>
        </div>
      </div>

      {/* Workers ativos */}
      {activeWorkers.length === 0 ? (
        <div className="px-5 py-6 text-[13px] text-text-3">
          <p className="mb-2">
            🔴 Nenhum worker ativo detectado. O sistema não está processando
            tarefas neste momento.
          </p>
          <p className="text-[11.5px]">
            Pra reiniciar, rode no servidor:{" "}
            <code className="mono bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded text-text">
              bun --env-file=.env.local run worker/index.ts
            </code>
          </p>
          <Link
            href="/admin/guias/workers"
            className="inline-flex items-center gap-1 text-[11.5px] text-[#67E8F9] hover:underline mt-2"
          >
            <BookOpen size={11} />
            Como funcionam os workers?
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-hairline)]">
          {activeWorkers.map((w) => (
            <ActiveWorkerRow key={w.worker_id} worker={w} />
          ))}
        </div>
      )}

      {/* Histórico de instâncias antigas (colapsado) */}
      {historicalWorkers.length > 0 && (
        <div className="border-t border-[var(--border-hairline)]">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="
              w-full px-5 py-2.5 flex items-center justify-between
              text-[11.5px] text-text-3 hover:text-text-2 hover:bg-[var(--bg-glass)]
              transition-colors
            "
          >
            <span className="inline-flex items-center gap-1.5">
              {showHistory ? (
                <ChevronUp size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
              {historicalWorkers.length} instância
              {historicalWorkers.length === 1 ? "" : "s"} anterior
              {historicalWorkers.length === 1 ? "" : "es"} (histórico)
            </span>
            <span className="text-text-3">
              {showHistory ? "ocultar" : "mostrar"}
            </span>
          </button>
          {showHistory && (
            <div className="divide-y divide-[var(--border-hairline)] bg-[var(--bg-glass)]">
              {historicalWorkers.map((w) => (
                <HistoricalWorkerRow key={w.worker_id} worker={w} />
              ))}
              <div className="px-5 py-2.5 text-[10.5px] text-text-3 bg-transparent">
                💡 Cada vez que o worker é reiniciado, vira uma nova instância.
                Só a mais recente está ativa — as outras são registros
                históricos.
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ActiveWorkerRow({ worker: w }: { worker: WorkerInfo }) {
  const runningTotal = Object.values(w.running_counts ?? {}).reduce(
    (s: number, n) => s + (typeof n === "number" ? n : 0),
    0
  );

  return (
    <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
      <span
        className="w-2 h-2 rounded-full shrink-0 animate-pulse"
        style={{
          background: "var(--success)",
          boxShadow: "0 0 8px var(--success)",
        }}
        aria-hidden="true"
      />

      <div className="flex-1 min-w-[200px] flex items-center gap-4 flex-wrap">
        <span className="text-[13px] font-semibold text-text">
          Processo ativo
          <span className="text-text-3 font-normal ml-1.5">
            · rodando há {w.uptime_human}
          </span>
        </span>

        <span className="inline-flex items-center gap-1 text-[11px] text-text-3">
          <Activity size={10} strokeWidth={1.8} />
          <span className="mono tabular-nums">
            {runningTotal > 0
              ? `${runningTotal} tarefa${runningTotal === 1 ? "" : "s"} rodando agora`
              : "aguardando fila"}
          </span>
        </span>

        <span className="inline-flex items-center gap-1 text-[11px] text-text-3">
          <CheckCircle2 size={10} strokeWidth={1.8} />
          <span className="mono tabular-nums">
            {w.jobs_processed} concluídas
            {w.jobs_errored > 0 && (
              <span className="text-[var(--error)]">
                {" "}
                · {w.jobs_errored} falhas
              </span>
            )}
          </span>
        </span>
      </div>

      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
        style={{
          color: "var(--success)",
          background: "color-mix(in srgb, var(--success) 12%, transparent)",
        }}
      >
        <CheckCircle2 size={10} strokeWidth={2.4} />
        Saudável
      </span>

      <span
        className="mono text-[10px] text-text-3 tabular-nums shrink-0"
        title={`PID ${w.pid} · ID técnico: ${w.worker_id}`}
      >
        última atividade há {w.last_beat_age_seconds}s
      </span>
    </div>
  );
}

function HistoricalWorkerRow({ worker: w }: { worker: WorkerInfo }) {
  const statusLabel =
    w.status === "stale"
      ? "Sem resposta"
      : w.status === "dead"
      ? "Desligado"
      : w.status;
  const statusColor =
    w.status === "stale" ? "#F59E0B" : w.status === "dead" ? "var(--error)" : "var(--text-3)";

  return (
    <div className="px-5 py-2.5 flex items-center gap-3 flex-wrap opacity-80">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: statusColor }}
        aria-hidden="true"
      />

      <div className="flex-1 min-w-[180px] flex items-center gap-3 flex-wrap">
        <span className="text-[11.5px] text-text-2">
          Instância anterior
          <span className="text-text-3 ml-1.5">· rodou por {w.uptime_human}</span>
        </span>
        <span className="mono text-[10px] text-text-3 tabular-nums">
          {w.jobs_processed} processadas
          {w.jobs_errored > 0 && (
            <span className="text-[var(--error)]"> · {w.jobs_errored} err</span>
          )}
        </span>
      </div>

      <span
        className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
        style={{
          color: statusColor,
          background: `color-mix(in srgb, ${statusColor} 10%, transparent)`,
        }}
      >
        {statusLabel}
      </span>

      <span className="mono text-[10px] text-text-3 tabular-nums shrink-0">
        há {formatAge(w.last_beat_age_seconds)}
      </span>
    </div>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `agora (${sec}s atrás)`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min atrás`;
  return new Date(iso).toLocaleTimeString("pt-BR");
}
