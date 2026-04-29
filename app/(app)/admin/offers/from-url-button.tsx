"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  X,
  Check,
  AlertTriangle,
  Link as LinkIcon,
  Zap,
  Globe,
  Camera,
  Film,
  Target,
  Video,
  ShoppingCart,
  Brain,
  Mic,
  Flag,
} from "lucide-react";

type EnrichResult = {
  ok: boolean;
  id?: string; // offer_id
  slug?: string;
  title?: string;
  niche?: string | null;
  vslDownloaded?: boolean;
  vslTranscribed?: boolean;
  creativesCreated?: number;
  landingPagesCreated?: number;
  checkoutPagesCreated?: number;
  adCount?: number | null;
  error?: string;
};

type JobStatus = {
  id: string;
  status: "pending" | "running" | "done" | "error";
  error?: string | null;
};

/**
 * Stages do pipeline em ordem + tempo aproximado cumulativo (seconds).
 * O stepper ativa o stage quando elapsed ≥ startAt. "Done" quando elapsed ≥ nextStartAt.
 */
const STAGES = [
  { id: 1, icon: Globe, label: "Abrindo página", startAt: 0 },
  { id: 2, icon: Camera, label: "Screenshot da Ad Library", startAt: 10 },
  { id: 3, icon: Film, label: "Baixando criativos", startAt: 18 },
  { id: 4, icon: Target, label: "Descobrindo landings", startAt: 45 },
  { id: 5, icon: Video, label: "Extraindo VSL (HLS/mp4)", startAt: 70 },
  { id: 6, icon: ShoppingCart, label: "Detectando checkout", startAt: 105 },
  { id: 7, icon: Brain, label: "Classificando nicho (GPT-4)", startAt: 115 },
  { id: 8, icon: Mic, label: "Transcrevendo com Whisper", startAt: 125 },
  { id: 9, icon: Flag, label: "Finalizando", startAt: 175 },
] as const;

function pickStageIdx(elapsed: number, done: boolean): number {
  if (done) return STAGES.length - 1;
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (elapsed >= STAGES[i].startAt) return i;
  }
  return 0;
}

export function FromUrlButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EnrichResult | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Ticker: atualiza elapsed enquanto running
  useEffect(() => {
    if (!running || !startedAt) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [running, startedAt]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!url.trim() || running) return;
    setRunning(true);
    setResult(null);
    setStartedAt(Date.now());
    setElapsed(0);
    try {
      // 1. Enqueue job — retorna imediatamente com job_id + offer_id
      const enqueueRes = await fetch("/api/admin/offers/from-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const enqueueData = await enqueueRes.json();
      if (!enqueueRes.ok) {
        setResult({ ok: false, error: enqueueData.error ?? `HTTP ${enqueueRes.status}` });
        setRunning(false);
        return;
      }

      const jobId = enqueueData.job_id as string;
      const offerId = enqueueData.offer_id as string;

      // 2. Poll: pipeline completo quando offer.title !== "Extraindo...".
      //    Só transiciona pro success view (chama setResult) quando completou —
      //    enquanto roda, mantém o stepper visível. Captura erro permanente
      //    do job inicial pra falhar rápido.
      const POLL_INTERVAL_MS = 3000;
      const MAX_POLL_MS = 8 * 60 * 1000; // 8min — VSLs longas + Whisper podem demorar
      const t0 = Date.now();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        // 2a. Checa job inicial só pra capturar erro permanente (3 attempts esgotados)
        const statusRes = await fetch(`/api/admin/jobs/${jobId}`, { cache: "no-store" });
        if (statusRes.ok) {
          const job = (await statusRes.json()) as JobStatus;
          if (job.status === "error") {
            setResult({ ok: false, error: job.error ?? "worker_error" });
            break;
          }
        }

        // 2b. Polla a oferta. Só transiciona pro success view quando
        //     title mudou (pipeline completo) ou timeout 8min.
        const offerRes = await fetch(`/api/admin/offers/${offerId}`, { cache: "no-store" });
        if (offerRes.ok) {
          const d = await offerRes.json();
          const isStillExtracting = d.offer.title === "Extraindo...";
          const timedOut = Date.now() - t0 > MAX_POLL_MS;

          if (!isStillExtracting || timedOut) {
            // Pipeline completou (ou timeout) — finaliza com snapshot atual
            setResult({
              ok: true,
              id: offerId,
              slug: d.offer.slug,
              title: d.offer.title,
              niche: d.offer.niche,
              vslDownloaded: !!d.offer.vsl_storage_path,
              vslTranscribed: !!d.offer.transcript_text,
              creativesCreated: d.creatives?.length ?? 0,
              landingPagesCreated: d.pages?.filter((p: { type: string }) => p.type === "main_site").length ?? 0,
              checkoutPagesCreated: d.pages?.filter((p: { type: string }) => p.type === "checkout").length ?? 0,
              adCount: d.offer.ad_count,
            });
            break;
          }
          // Ainda extraindo — não chama setResult, mantém stepper visível
        }
      }
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "erro desconhecido",
      });
    } finally {
      setRunning(false);
    }
  }

  function goToEdit() {
    if (!result?.id) return;
    router.push(`/admin/offers/${result.id}/edit`);
  }

  function reset() {
    setOpen(false);
    setUrl("");
    setResult(null);
    setElapsed(0);
    setStartedAt(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          inline-flex items-center gap-2 px-4 py-2.5 rounded-full
          text-white font-medium text-[13px]
          transition-[transform,box-shadow] duration-200 ease-[var(--ease-spring)]
          hover:scale-[1.02] hover:-translate-y-[1px]
          active:scale-[0.97]
        "
        style={{
          background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
          boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
        }}
      >
        <Sparkles size={15} strokeWidth={2} />
        Subir via URL
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              // Permite fechar durante running — o fetch continua em background
              setOpen(false);
              // Se fechou durante running, mantém fetch rodando (não reseta elapsed/result)
              if (!running) reset();
            }
          }}
        >
          <div className="glass-strong rounded-[var(--r-xl)] p-6 w-full max-w-[560px] flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-0.5 flex items-center gap-1.5"
                     style={{ color: "#8B5CF6" }}>
                  <Zap size={11} strokeWidth={2.2} />
                  Worker · drop-in
                </div>
                <h2 className="display text-[22px] font-semibold tracking-[-0.02em]">
                  Subir oferta via URL
                </h2>
                <p className="text-[12px] text-text-2 mt-1.5 leading-relaxed">
                  Cola a URL da Ad Library ou da landing. Em ~1-3 min o worker
                  extrai: título + nicho (IA) + 5 criativos + landing + checkout
                  + VSL + transcrição Whisper.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  // Durante running, só fecha modal (fetch continua em background,
                  // admin vê progresso real na lista admin na row pulsante)
                  setOpen(false);
                  if (!running) reset();
                }}
                title={running ? "Minimizar (worker continua em background)" : "Fechar"}
                className="p-1.5 text-text-3 hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            {!result ? (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="relative">
                  <LinkIcon
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
                  />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={running}
                    required
                    autoFocus
                    placeholder="https://facebook.com/ads/library/... ou https://landing.com/"
                    className="
                      w-full pl-9 pr-4 py-3 rounded-[var(--r-md)]
                      bg-black/40 border border-[var(--border-default)]
                      text-[14px] text-text placeholder:text-text-3
                      transition-[border-color,background] duration-200
                      focus:outline-none focus:border-[#8B5CF6]
                      focus:bg-black/60 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)]
                      disabled:opacity-60
                    "
                  />
                </div>

                {running && <WorkerStepper elapsed={elapsed} />}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (!running) reset();
                    }}
                    className="px-4 py-2 rounded-full text-[13px] text-text-2 hover:text-text"
                  >
                    {running ? "Minimizar" : "Cancelar"}
                  </button>
                  <button
                    type="submit"
                    disabled={running || !url.trim()}
                    className="
                      inline-flex items-center gap-2 px-5 py-2.5 rounded-full
                      text-white font-medium text-[13px]
                      transition-[transform,opacity] duration-200 ease-[var(--ease-spring)]
                      hover:scale-[1.02]
                      disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100
                    "
                    style={{
                      background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
                    }}
                  >
                    {running ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} strokeWidth={2} />
                    )}
                    {running ? "Extraindo..." : "Subir oferta"}
                  </button>
                </div>
              </form>
            ) : result.ok ? (
              <div className="flex flex-col gap-4">
                <div
                  className="rounded-[var(--r-md)] p-4 border border-[var(--success)]/30"
                  style={{
                    background: "color-mix(in srgb, var(--success) 10%, transparent)",
                  }}
                >
                  <div className="flex items-center gap-2 text-[var(--success)] text-[13px] font-medium mb-2">
                    <Check size={14} strokeWidth={2.2} />
                    Oferta criada em {elapsed}s
                  </div>
                  <div className="text-[13px] font-medium text-text mb-1 truncate">
                    {result.title}
                  </div>
                  <div className="text-[11px] text-text-3 mono truncate">
                    /app/{result.slug}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <Stat label="Nicho" value={result.niche ?? "—"} highlight />
                  <Stat label="ad_count" value={result.adCount != null ? String(result.adCount) : "—"} />
                  <Stat label="Criativos" value={String(result.creativesCreated ?? 0)} />
                  <Stat label="Landings" value={String(result.landingPagesCreated ?? 0)} />
                  <Stat label="Checkouts" value={String(result.checkoutPagesCreated ?? 0)} />
                  <Stat
                    label="VSL"
                    value={
                      result.vslDownloaded
                        ? result.vslTranscribed
                          ? "✓ + transcrita"
                          : "✓ baixada"
                        : "—"
                    }
                    highlight={result.vslDownloaded}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={reset}
                    className="px-4 py-2 rounded-full text-[13px] text-text-2 hover:text-text"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={goToEdit}
                    className="
                      inline-flex items-center gap-2 px-5 py-2.5 rounded-full
                      bg-[var(--accent)] text-black font-medium text-[13px]
                      hover:scale-[1.02] transition-transform duration-200 ease-[var(--ease-spring)]
                    "
                  >
                    Editar oferta →
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div
                  className="rounded-[var(--r-md)] p-4 border border-[var(--error)]/30"
                  style={{
                    background: "color-mix(in srgb, var(--error) 10%, transparent)",
                  }}
                >
                  <div className="flex items-start gap-2 text-[var(--error)]">
                    <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[13px] font-medium">Falhou</div>
                      <div className="text-[11px] mt-1 text-text-2">{result.error}</div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="
                      inline-flex items-center gap-2 px-5 py-2.5 rounded-full
                      bg-[var(--accent)] text-black font-medium text-[13px]
                    "
                  >
                    Tentar de novo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`
        rounded-[var(--r-sm)] px-3 py-2 flex flex-col gap-0.5
        ${highlight ? "border border-[#8B5CF6]/30" : "border border-[var(--border-hairline)]"}
      `}
      style={
        highlight
          ? { background: "rgba(139,92,246,0.08)" }
          : { background: "rgba(0,0,0,0.2)" }
      }
    >
      <span className="text-[9px] text-text-3 uppercase tracking-[0.14em]">{label}</span>
      <span className="text-[13px] font-medium text-text mono truncate">{value}</span>
    </div>
  );
}

function WorkerStepper({ elapsed }: { elapsed: number }) {
  const currentIdx = pickStageIdx(elapsed, false);
  const currentStage = STAGES[currentIdx];
  const ETA = STAGES[STAGES.length - 1].startAt + 40; // ~215s total
  const progressPct = Math.min(99, (elapsed / ETA) * 100);

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-[var(--r-md)]"
      style={{
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.05) 100%)",
        border: "1px solid rgba(139,92,246,0.25)",
      }}
    >
      {/* Header com stage atual + timer */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" style={{ color: "#A78BFA" }} />
          <div className="flex flex-col">
            <span className="text-[12px] font-semibold" style={{ color: "#C4B5FD" }}>
              {currentStage.label}
            </span>
            <span className="text-[10px] text-text-3">
              Stage {currentIdx + 1} de {STAGES.length}
            </span>
          </div>
        </div>
        <div className="mono text-[11px] text-text-3">
          {elapsed}s <span className="text-text-4">/ ~{ETA}s</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(139,92,246,0.15)" }}>
        <div
          className="h-full transition-all duration-700 ease-out"
          style={{
            width: `${progressPct}%`,
            background: "linear-gradient(90deg, #6366F1 0%, #8B5CF6 100%)",
            boxShadow: "0 0 10px rgba(139,92,246,0.6)",
          }}
        />
      </div>

      {/* Stepper em grid 3x3 */}
      <div className="grid grid-cols-3 gap-1.5 mt-1">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isPending = i > currentIdx;
          return (
            <div
              key={stage.id}
              className={`
                flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--r-sm)]
                transition-all duration-300
                ${isCurrent ? "stepper-active" : ""}
              `}
              style={{
                background: isCurrent
                  ? "rgba(139,92,246,0.18)"
                  : isDone
                  ? "rgba(34,197,94,0.08)"
                  : "rgba(0,0,0,0.15)",
                border: `1px solid ${
                  isCurrent
                    ? "rgba(139,92,246,0.5)"
                    : isDone
                    ? "rgba(34,197,94,0.25)"
                    : "rgba(255,255,255,0.06)"
                }`,
              }}
            >
              <div
                className="shrink-0 grid place-items-center w-5 h-5 rounded-full"
                style={{
                  background: isDone
                    ? "rgba(34,197,94,0.2)"
                    : isCurrent
                    ? "rgba(139,92,246,0.3)"
                    : "rgba(255,255,255,0.04)",
                }}
              >
                {isDone ? (
                  <Check size={10} strokeWidth={3} style={{ color: "#4ADE80" }} />
                ) : isCurrent ? (
                  <Icon size={10} strokeWidth={2} style={{ color: "#C4B5FD" }} />
                ) : (
                  <Icon size={10} strokeWidth={1.5} className="text-text-4" />
                )}
              </div>
              <span
                className={`
                  text-[10px] font-medium truncate
                  ${isCurrent ? "" : isDone ? "text-[#4ADE80]" : "text-text-4"}
                `}
                style={isCurrent ? { color: "#DDD6FE" } : undefined}
              >
                {stage.label.replace(/\s*\(.*\)/, "")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-text-3 text-center">
        Pode minimizar (X) e continuar usando o app. O worker continua em
        background e a lista admin mostra o progresso em tempo real.
      </div>
    </div>
  );
}
