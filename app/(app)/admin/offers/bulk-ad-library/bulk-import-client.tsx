"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  Download,
  Image as ImageIcon,
  Mic,
  Sparkles,
  Video,
  Clock,
  ExternalLink,
  ChevronRight,
  Trash2,
  Play,
  Radio,
} from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import type { BulkOfferStatus, BulkStage } from "@/app/api/admin/offers/bulk-status/route";

// ─────────────────────────────────────────────────────────────
// Stage definition — a pipeline visual
// ─────────────────────────────────────────────────────────────

type StageInfo = {
  key: BulkStage;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const PIPELINE: StageInfo[] = [
  {
    key: "queued",
    label: "Na fila",
    description: "Aguardando worker",
    icon: Clock,
  },
  {
    key: "prep_landing",
    label: "Descobrindo landing",
    description: "Meta API pega ads ativos → landing real",
    icon: Radio,
  },
  {
    key: "extracting_vsl",
    label: "Baixando VSL",
    description: "Playwright + ffmpeg (se landing tiver VSL)",
    icon: Download,
  },
  {
    key: "generating_thumb",
    label: "Thumbnail",
    description: "Frame aos 3s",
    icon: ImageIcon,
  },
  {
    key: "transcribing",
    label: "Transcrevendo",
    description: "Whisper (OpenAI)",
    icon: Mic,
  },
  {
    key: "ai_drafting",
    label: "IA redigindo",
    description: "GPT-4o-mini vision",
    icon: Sparkles,
  },
  {
    key: "syncing_creatives",
    label: "Sync criativos",
    description: "Ad Library API",
    icon: Video,
  },
  {
    key: "ready",
    label: "Pronta",
    description: "Aguarda aprovação",
    icon: CheckCircle2,
  },
];

const STAGE_ORDER: Record<BulkStage, number> = {
  queued: 0,
  prep_landing: 1,
  extracting_vsl: 2,
  generating_thumb: 3,
  transcribing: 4,
  ai_drafting: 5,
  syncing_creatives: 6,
  ready: 7,
  ready_no_vsl: 7,
  error: -1,
};

// ─────────────────────────────────────────────────────────────
// Local row type — merge da response do create + do polling
// ─────────────────────────────────────────────────────────────

type Row = {
  offer_id: string;
  slug: string;
  url: string;
  /** Última stage observada + timestamp (usado pra detectar stuck > 60s) */
  last_stage?: BulkStage;
  last_stage_at?: number;
  status: BulkOfferStatus | null; // null até o 1º poll
};

type InitialEntry = {
  url: string;
  offer_id: string;
  slug: string;
  job_id: string;
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function BulkImportClient() {
  const router = useRouter();
  const { toast } = useToast();
  const [urlsText, setUrlsText] = useState("");
  const [phase, setPhase] = useState<"input" | "processing" | "done">("input");
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<Array<{ url: string; error: string; reason?: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  // URLs derivados do texto — 1 por linha
  const parsedUrls = urlsText
    .split(/[\r\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const validUrls = parsedUrls.filter((u) => {
    try {
      const p = new URL(u);
      return p.protocol === "http:" || p.protocol === "https:";
    } catch {
      return false;
    }
  });

  const invalidCount = parsedUrls.length - validUrls.length;

  // ── Submit ──
  async function handleSubmit() {
    if (validUrls.length === 0) {
      toast({ kind: "error", title: "Cole pelo menos 1 URL válida" });
      return;
    }
    if (validUrls.length > 50) {
      toast({
        kind: "error",
        title: "Limite: 50 URLs por vez",
        description: `Você colou ${validUrls.length}. Divide em lotes.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/offers/bulk-from-urls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: validUrls }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const created = (data.created ?? []) as InitialEntry[];
      const err = (data.errors ?? []) as Array<{
        url: string;
        error: string;
        reason?: string;
      }>;

      setRows(
        created.map((c) => ({
          offer_id: c.offer_id,
          slug: c.slug,
          url: c.url,
          status: null,
        }))
      );
      setErrors(err);

      if (created.length > 0) {
        setPhase("processing");
        toast({
          kind: "success",
          title: `${created.length} oferta${created.length === 1 ? "" : "s"} enfileirada${created.length === 1 ? "" : "s"}`,
          description: err.length > 0 ? `${err.length} falharam (veja abaixo)` : "Workers já começaram o processamento.",
        });
      } else {
        toast({
          kind: "error",
          title: "Nenhuma oferta criada",
          description: "Todas as URLs deram erro — confere a lista.",
        });
      }
    } catch (e) {
      toast({
        kind: "error",
        title: "Erro no bulk import",
        description: e instanceof Error ? e.message : "erro",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Polling ──
  const pollingRef = useRef(false);

  const pollStatuses = useCallback(async () => {
    if (rows.length === 0) return;
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const ids = rows.map((r) => r.offer_id).join(",");
      const res = await fetch(`/api/admin/offers/bulk-status?ids=${ids}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        statuses: BulkOfferStatus[];
      };
      const byId = new Map(data.statuses.map((s) => [s.offer_id, s]));
      const now = Date.now();
      setRows((prev) =>
        prev.map((r) => {
          const newStatus = byId.get(r.offer_id) ?? r.status;
          const newStage = newStatus?.stage;
          // Rastreia mudança de stage: se mudou, reseta last_stage_at;
          // se ficou igual, mantém timestamp original pra calcular "stuck"
          const stageChanged = newStage !== r.last_stage;
          return {
            ...r,
            status: newStatus,
            last_stage: newStage ?? r.last_stage,
            last_stage_at: stageChanged ? now : r.last_stage_at ?? now,
          };
        })
      );
    } catch {
      /* silent — polling errors don't matter */
    } finally {
      pollingRef.current = false;
    }
  }, [rows]);

  useEffect(() => {
    if (phase !== "processing") return;
    // Poll inicial imediato + intervalo de 2.5s
    pollStatuses();
    const id = setInterval(pollStatuses, 2500);
    return () => clearInterval(id);
  }, [phase, pollStatuses]);

  // Quando todas ficam ready/error → marca como done
  useEffect(() => {
    if (phase !== "processing") return;
    if (rows.length === 0) return;
    const allFinal = rows.every(
      (r) =>
        r.status?.stage === "ready" ||
        r.status?.stage === "ready_no_vsl" ||
        r.status?.stage === "error"
    );
    if (allFinal) {
      setPhase("done");
    }
  }, [phase, rows]);

  function reset() {
    setPhase("input");
    setRows([]);
    setErrors([]);
    setUrlsText("");
  }

  const totalReady = rows.filter(
    (r) => r.status?.stage === "ready" || r.status?.stage === "ready_no_vsl"
  ).length;
  const totalNoVsl = rows.filter((r) => r.status?.stage === "ready_no_vsl").length;
  const totalError = rows.filter((r) => r.status?.stage === "error").length;
  const totalWorking = rows.length - totalReady - totalError;

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  if (phase === "input") {
    return (
      <div className="flex flex-col gap-4">
        <div className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-3">
          <label className="text-[11px] uppercase tracking-wider text-text-3 font-semibold flex items-center justify-between">
            <span>Links do Ad Library (um por linha)</span>
            <span className="mono text-[11px] text-text-2">
              {validUrls.length} válidas{invalidCount > 0 && ` · ${invalidCount} inválidas`}
            </span>
          </label>

          <textarea
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            placeholder={`https://www.facebook.com/ads/library/?view_all_page_id=...\nhttps://www.facebook.com/ads/library/?view_all_page_id=...\nhttps://...`}
            rows={14}
            spellCheck={false}
            disabled={submitting}
            className="
              w-full rounded-[var(--r-md)] px-4 py-3
              mono text-[12.5px] leading-relaxed
              bg-[var(--bg-elevated)] border border-[var(--border-hairline)]
              text-text placeholder:text-text-4
              focus:outline-none focus:border-[var(--accent)]
              focus:shadow-[0_0_0_3px_var(--accent-soft)]
              resize-y disabled:opacity-60
            "
          />

          <div className="flex items-start gap-3 text-[11.5px] text-text-3 leading-relaxed">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <div>
              Aceita URLs do <strong className="text-text">Ad Library</strong>{" "}
              (<span className="mono text-[11px]">facebook.com/ads/library/</span>)
              ou landing pages diretas. Cada URL vira 1 oferta em{" "}
              <span className="mono text-[11px]">status=draft</span>. Máximo 50 por vez.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-text-3">
            {validUrls.length > 0
              ? `~${Math.ceil((validUrls.length * 3) / 60)}-${Math.ceil((validUrls.length * 6) / 60)}min pra processar tudo (workers em paralelo)`
              : "Cole URLs pra começar"}
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || validUrls.length === 0}
            className="
              inline-flex items-center gap-2 h-10 px-5 rounded-full
              bg-[var(--accent)] text-black font-semibold text-[13px]
              hover:scale-[1.02] active:scale-[0.97]
              transition-transform disabled:opacity-50 disabled:hover:scale-100
            "
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} strokeWidth={2} />
            )}
            Enfileirar {validUrls.length > 0 ? `${validUrls.length} oferta${validUrls.length === 1 ? "" : "s"}` : "ofertas"}
          </button>
        </div>
      </div>
    );
  }

  // ── Processing / Done ──
  return (
    <div className="flex flex-col gap-4">
      {/* Header stats */}
      <div className="glass rounded-[var(--r-lg)] p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {phase === "processing" ? (
            <>
              <span className="relative grid place-items-center w-7 h-7">
                <span
                  className="absolute inset-0 rounded-full pulse-dot"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 30%, transparent)",
                  }}
                />
                <Loader2 size={14} className="animate-spin relative z-10" />
              </span>
              <span className="text-[14px] font-semibold text-text">
                Processando {totalWorking} de {rows.length}
              </span>
            </>
          ) : (
            <>
              <span
                className="w-7 h-7 rounded-full grid place-items-center"
                style={{
                  background: "color-mix(in srgb, var(--success) 18%, transparent)",
                  color: "var(--success)",
                }}
              >
                <CheckCircle2 size={14} strokeWidth={2} />
              </span>
              <span className="text-[14px] font-semibold text-text">
                Processamento concluído
              </span>
            </>
          )}
        </div>

        <div className="h-5 w-px" style={{ background: "var(--border-hairline)" }} />

        <div className="flex items-center gap-3 text-[12px] text-text-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--success)" }} />
            <span className="mono tabular-nums">{totalReady}</span> prontas
            {totalNoVsl > 0 && (
              <span className="text-[11px] text-text-3">
                ({totalNoVsl} só screenshot)
              </span>
            )}
          </span>
          {totalError > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--error)" }} />
              <span className="mono tabular-nums">{totalError}</span> com erro
            </span>
          )}
          {totalWorking > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--warning)" }} />
              <span className="mono tabular-nums">{totalWorking}</span> em andamento
            </span>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {phase === "done" && totalReady > 0 && (
            <Link
              href="/admin/ai-suggest"
              className="
                inline-flex items-center gap-1.5 h-9 px-3 rounded-full
                text-[12.5px] font-medium text-text
                bg-[var(--accent)] text-black font-semibold
                hover:scale-[1.02] transition-transform
              "
              onClick={() => router.refresh()}
            >
              Revisar AI Suggest
              <ChevronRight size={12} strokeWidth={2.5} />
            </Link>
          )}
          <button
            type="button"
            onClick={reset}
            className="
              inline-flex items-center gap-1.5 h-9 px-3 rounded-full
              text-[12.5px] font-medium text-text-2 hover:text-text
              glass-light hover:bg-[var(--bg-glass-hover)]
              transition-colors
            "
          >
            Novo lote
          </button>
        </div>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <RowCard key={row.offer_id} row={row} />
        ))}
      </div>

      {/* Errors do request inicial */}
      {errors.length > 0 && (
        <div
          className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-3"
          style={{
            borderLeft: "3px solid var(--error)",
            background: "color-mix(in srgb, var(--error) 4%, transparent)",
          }}
        >
          <div className="flex items-center gap-2 text-[13px] font-semibold text-text">
            <AlertTriangle size={14} style={{ color: "var(--error)" }} />
            {errors.length} URL{errors.length === 1 ? "" : "s"} não puderam ser criadas
          </div>
          <ul className="flex flex-col gap-1.5 text-[12px]">
            {errors.map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <X size={11} style={{ color: "var(--error)" }} className="mt-1 shrink-0" />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="mono text-[11px] text-text truncate">{e.url}</span>
                  <span className="text-text-3">
                    {e.error}
                    {e.reason && ` — ${e.reason}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Row — card de cada oferta com timeline animada
// ─────────────────────────────────────────────────────────────

function RowCard({ row }: { row: Row }) {
  const stage: BulkStage = row.status?.stage ?? "queued";
  const progress = row.status?.progress ?? 5;
  const isError = stage === "error";
  const isDone = stage === "ready" || stage === "ready_no_vsl";
  const isNoVsl = stage === "ready_no_vsl";

  // Stuck: mesmo stage há mais de 60s, e não é ready/error
  const stuckMs = row.last_stage_at ? Date.now() - row.last_stage_at : 0;
  const isStuck = !isDone && !isError && stuckMs > 60_000;
  const stuckSeconds = Math.floor(stuckMs / 1000);

  const displayTitle =
    row.status && row.status.title !== "Extraindo..."
      ? row.status.title
      : new URL(row.url).hostname.replace(/^www\./, "");

  return (
    <div
      className="glass rounded-[var(--r-lg)] overflow-hidden transition-[border-color,background] duration-300"
      style={{
        borderLeft: `3px solid ${
          isError
            ? "var(--error)"
            : isNoVsl
              ? "#F59E0B"
              : isDone
                ? "var(--success)"
                : "var(--accent)"
        }`,
      }}
    >
      {/* Header */}
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold text-text truncate max-w-[360px]">
              {displayTitle}
            </span>
            <StageBadge stage={stage} />
            {isStuck && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                style={{
                  color: "#F59E0B",
                  background: "color-mix(in srgb, #F59E0B 14%, transparent)",
                  border: "1px solid color-mix(in srgb, #F59E0B 30%, transparent)",
                }}
                title={`Mesmo stage há ${stuckSeconds}s. Worker pode estar travado ou landing demorando.`}
              >
                <AlertTriangle size={9} strokeWidth={2.5} />
                Travado há {stuckSeconds}s
              </span>
            )}
          </div>
          <a
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mono text-[10.5px] text-text-3 hover:text-text-2 truncate inline-flex items-center gap-1 max-w-[600px]"
          >
            {row.url}
            <ExternalLink size={9} strokeWidth={1.8} />
          </a>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDone && (
            <Link
              href={`/admin/offers/${row.offer_id}/edit`}
              className="
                inline-flex items-center gap-1 h-7 px-2.5 rounded-full
                text-[11px] font-semibold
                border border-[var(--border-default)]
                text-text hover:bg-[var(--bg-glass)]
                transition-colors
              "
            >
              Revisar
              <ChevronRight size={11} strokeWidth={2.5} />
            </Link>
          )}
          <span
            className="mono text-[11px] font-semibold tabular-nums"
            style={{ color: isError ? "var(--error)" : "var(--text-2)" }}
          >
            {progress}%
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="relative h-[2px] overflow-hidden"
        style={{
          background: "var(--border-hairline)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
          style={{
            width: `${progress}%`,
            background: isError
              ? "var(--error)"
              : isNoVsl
                ? "#F59E0B"
                : isDone
                  ? "var(--success)"
                  : "linear-gradient(90deg, var(--accent) 0%, #A8A8A8 100%)",
            boxShadow: isDone
              ? "none"
              : isError
                ? "0 0 8px var(--error)"
                : "0 0 8px var(--accent-glow)",
          }}
        />
        {/* Shimmer overlay em stages ativas */}
        {!isDone && !isError && stage !== "queued" && (
          <div
            className="absolute inset-y-0 shimmer-bar"
            style={{
              width: "30%",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
            }}
          />
        )}
      </div>

      {/* Timeline de stages */}
      <div className="px-5 py-3">
        <Timeline currentStage={stage} rowStatus={row.status} />
      </div>

      {/* Erro inline */}
      {isError && row.status?.last_error && (
        <div
          className="px-5 py-3 text-[11.5px] mono border-t"
          style={{
            borderColor: "var(--border-hairline)",
            color: "var(--error)",
            background: "color-mix(in srgb, var(--error) 4%, transparent)",
          }}
        >
          <AlertTriangle size={10} className="inline mr-1.5 -mt-0.5" />
          {row.status.last_error.slice(0, 200)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Timeline de stages
// ─────────────────────────────────────────────────────────────

function Timeline({
  currentStage,
  rowStatus,
}: {
  currentStage: BulkStage;
  rowStatus: BulkOfferStatus | null;
}) {
  const currentOrder = STAGE_ORDER[currentStage];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PIPELINE.map((s, i) => {
        const order = STAGE_ORDER[s.key];
        const isActive = s.key === currentStage && currentStage !== "ready";
        const isDone = order < currentOrder || currentStage === "ready";
        const isFuture = !isActive && !isDone && currentStage !== "error";
        const isErrorState = currentStage === "error";

        const Icon = s.icon;

        let color = "var(--text-4)";
        let bg = "transparent";
        let border = "var(--border-hairline)";

        if (isErrorState && i === 0) {
          color = "var(--error)";
          bg = "color-mix(in srgb, var(--error) 14%, transparent)";
          border = "color-mix(in srgb, var(--error) 30%, transparent)";
        } else if (isActive) {
          color = "var(--accent)";
          bg = "color-mix(in srgb, var(--accent) 14%, transparent)";
          border = "color-mix(in srgb, var(--accent) 30%, transparent)";
        } else if (isDone) {
          color = "var(--success)";
          bg = "color-mix(in srgb, var(--success) 12%, transparent)";
          border = "color-mix(in srgb, var(--success) 22%, transparent)";
        }

        return (
          <div
            key={s.key}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10.5px] font-medium transition-colors"
            style={{
              color,
              background: bg,
              border: `1px solid ${border}`,
              opacity: isFuture ? 0.45 : 1,
            }}
            title={s.description}
          >
            <span className="relative grid place-items-center w-3.5 h-3.5">
              {isActive ? (
                <>
                  <Loader2 size={11} className="animate-spin" strokeWidth={2.5} />
                </>
              ) : isDone ? (
                <CheckCircle2 size={10} strokeWidth={2.5} />
              ) : (
                <Icon size={10} strokeWidth={2} />
              )}
            </span>
            <span>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stage badge
// ─────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: BulkStage }) {
  const cfg = {
    queued: { label: "Na fila", color: "var(--text-3)" },
    prep_landing: { label: "Descobrindo landing", color: "var(--accent)" },
    extracting_vsl: { label: "Baixando VSL", color: "var(--accent)" },
    generating_thumb: { label: "Thumb", color: "var(--accent)" },
    transcribing: { label: "Transcrevendo", color: "var(--accent)" },
    ai_drafting: { label: "IA", color: "var(--accent)" },
    syncing_creatives: { label: "Criativos", color: "var(--accent)" },
    ready: { label: "Pronta", color: "var(--success)" },
    ready_no_vsl: { label: "Sem VSL · só screenshots", color: "#F59E0B" },
    error: { label: "Erro", color: "var(--error)" },
  }[stage];

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
      style={{
        color: cfg.color,
        background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
      }}
    >
      {stage === "ready" ? <Play size={8} strokeWidth={2.5} /> : null}
      {cfg.label}
    </span>
  );
}
