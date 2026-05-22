"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Film, Image as ImageIcon } from "lucide-react";

/**
 * Polla GET /api/admin/offers/{id}/active-jobs cada 3s pra detectar jobs
 * de extração de criativos rodando. Mostra barra animada com label do
 * stage atual e dispara router.refresh() quando jobs terminam (pra
 * carregar criativos novos sem full reload).
 */

type ActiveJob = {
  id: string;
  kind: string;
  status: "pending" | "running";
  elapsed_seconds: number;
};

type ActiveJobsResponse = {
  jobs: ActiveJob[];
  has_running: boolean;
  has_pending: boolean;
};

// Apenas kinds relacionados a extração de criativos
const RELEVANT_KINDS = new Set([
  "bulk_ad_library_prep",
  "enrich_from_url",
  "sync_creatives",
  "generate_thumb",
]);

const STAGE_LABELS: Record<string, string> = {
  bulk_ad_library_prep: "Descobrindo ads via Meta API",
  enrich_from_url: "Scrapeando landing + criativos",
  sync_creatives: "Baixando vídeos/imagens dos ads",
  generate_thumb: "Gerando thumbnails",
};

export function CreativesExtractStatus({
  offerId,
  currentCount,
}: {
  offerId: string;
  currentCount: number;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [lastCount, setLastCount] = useState(currentCount);
  const [hasBeenActive, setHasBeenActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let lastJobsKey = "";

    async function poll() {
      try {
        const res = await fetch(
          `/api/admin/offers/${offerId}/active-jobs`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ActiveJobsResponse;
        const relevant = (data.jobs ?? []).filter((j) =>
          RELEVANT_KINDS.has(j.kind)
        );
        const jobsKey = relevant.map((j) => `${j.id}:${j.status}`).join("|");
        setJobs(relevant);

        if (relevant.length > 0) {
          setHasBeenActive(true);
        } else if (hasBeenActive && jobsKey !== lastJobsKey) {
          // Acabou — refresh pra puxar criativos novos
          router.refresh();
          setHasBeenActive(false);
        }
        lastJobsKey = jobsKey;
      } catch {
        /* silent */
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [offerId, router, hasBeenActive]);

  // Detecta novos criativos chegando (recebido via props depois de refresh)
  useEffect(() => {
    if (currentCount !== lastCount) {
      setLastCount(currentCount);
    }
  }, [currentCount, lastCount]);

  if (jobs.length === 0) return null;

  // Pega o job mais recente (running tem prioridade sobre pending)
  const running = jobs.find((j) => j.status === "running");
  const current = running ?? jobs[0];
  const label = STAGE_LABELS[current.kind] ?? current.kind;
  const elapsedS = current.elapsed_seconds;

  return (
    <div
      className="
        rounded-[var(--r-md)] p-4 flex flex-col gap-2.5
        border border-[color-mix(in_srgb,#8B5CF6_30%,transparent)]
      "
      style={{
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.05) 100%)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="shrink-0 grid place-items-center w-8 h-8 rounded-full"
            style={{
              background: "rgba(139,92,246,0.18)",
              border: "1px solid rgba(139,92,246,0.35)",
            }}
          >
            <Loader2
              size={14}
              className="animate-spin"
              style={{ color: "#A78BFA" }}
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className="text-[12.5px] font-semibold truncate"
              style={{ color: "#C4B5FD" }}
            >
              {label}
            </span>
            <span className="text-[10.5px] text-text-3 mono">
              {current.status === "running" ? `${elapsedS}s rodando` : "aguardando worker"}
              {jobs.length > 1 && ` · +${jobs.length - 1} na fila`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-text-3 mono">
          {current.kind === "sync_creatives" || current.kind === "enrich_from_url" ? (
            <>
              <Film size={11} strokeWidth={1.8} />
              <span>{currentCount} criativos</span>
            </>
          ) : current.kind === "generate_thumb" ? (
            <>
              <ImageIcon size={11} strokeWidth={1.8} />
              <span>processando thumbs</span>
            </>
          ) : (
            <>
              <Sparkles size={11} strokeWidth={1.8} />
              <span>preparando</span>
            </>
          )}
        </div>
      </div>

      {/* Barra animada (shimmer indeterminada — não temos % real) */}
      <div
        className="h-[3px] rounded-full overflow-hidden"
        style={{ background: "rgba(139,92,246,0.15)" }}
      >
        <div
          className="h-full creatives-extract-shimmer"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, #8B5CF6 50%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
        />
      </div>

      <style>{`
        @keyframes creatives-extract-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .creatives-extract-shimmer {
          animation: creatives-extract-shimmer 1.6s linear infinite;
        }
      `}</style>
    </div>
  );
}
