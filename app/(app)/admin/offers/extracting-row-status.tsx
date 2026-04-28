"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Polla GET /api/admin/offers/{id} cada 3s pra uma oferta "Extraindo...".
 * Deriva o stage atual baseado em dados REAIS do DB:
 *   - Tem ad_library page → stage 2
 *   - Tem N creatives → stage 3 (mostra contador)
 *   - Tem main_site pages → stage 4
 *   - Tem vsl_storage_path → stage 5 done
 *   - Tem checkout → stage 6
 *   - niche != 'renda_extra' (default) → stage 7 done
 *   - Tem transcript_text → stage 8 done
 *   - title != "Extraindo..." → done (para polling)
 */

type Offer = {
  id: string;
  title: string;
  niche: string;
  vsl_storage_path: string | null;
  transcript_text: string | null;
  ad_count: number;
};

type Page = { type: string; screenshot_url: string | null };
type Creative = { id: string };

type LoadedData = {
  offer: Offer;
  pages: Page[];
  creatives: Creative[];
};

type Stage = {
  label: string;
  pct: number;
};

function deriveStage(data: LoadedData): Stage {
  const { offer, pages, creatives } = data;
  if (offer.title !== "Extraindo...") return { label: "Concluído", pct: 100 };

  const hasAdLibShot = pages.some((p) => p.type === "ad_library" && p.screenshot_url);
  const landings = pages.filter((p) => p.type === "main_site").length;
  const hasCheckout = pages.some((p) => p.type === "checkout");
  const hasVsl = !!offer.vsl_storage_path;
  const hasTranscript = !!offer.transcript_text && offer.transcript_text.length > 50;
  // "classificado" = niche não é o default inicial
  const hasNiche = offer.niche !== "renda_extra";

  if (hasTranscript) return { label: "Finalizando...", pct: 95 };
  if (hasVsl && hasNiche) return { label: "Transcrevendo Whisper", pct: 85 };
  if (hasVsl && hasCheckout) return { label: "Classificando nicho", pct: 78 };
  if (hasVsl) return { label: "Detectando checkout", pct: 70 };
  if (landings > 0) return { label: "Extraindo VSL (HLS/mp4)", pct: 60 };
  if (creatives.length >= 5) return { label: "Descobrindo landings", pct: 45 };
  if (creatives.length > 0) return { label: `Baixando criativos ${creatives.length}/5`, pct: 25 + creatives.length * 4 };
  if (hasAdLibShot) return { label: "Screenshot Ad Library", pct: 18 };
  if (offer.ad_count > 0) return { label: "Extraindo ad_count", pct: 12 };
  return { label: "Abrindo página...", pct: 5 };
}

export function ExtractingRowStatus({ offerId }: { offerId: string }) {
  const [stage, setStage] = useState<Stage>({ label: "Abrindo...", pct: 5 });
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/admin/offers/${offerId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as LoadedData;
        if (cancelled) return;
        const s = deriveStage(data);
        setStage(s);
        if (data.offer.title !== "Extraindo...") {
          setDone(true);
        }
      } catch {}
    }
    poll(); // primeira call imediata
    const id = setInterval(() => {
      if (!done) poll();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [offerId, done]);

  return (
    <div className="flex flex-col gap-1.5 py-0.5">
      <div className="flex items-center gap-2">
        <Loader2 size={13} className="animate-spin shrink-0" style={{ color: "#A78BFA" }} />
        <span className="font-medium text-[13px]" style={{ color: "#C4B5FD" }}>
          {stage.label}
        </span>
      </div>
      <div
        className="h-[3px] rounded-full overflow-hidden w-[200px]"
        style={{ background: "rgba(139,92,246,0.15)" }}
      >
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${stage.pct}%`,
            background: "linear-gradient(90deg, #6366F1 0%, #8B5CF6 100%)",
            boxShadow: "0 0 6px rgba(139,92,246,0.5)",
          }}
        />
      </div>
    </div>
  );
}
