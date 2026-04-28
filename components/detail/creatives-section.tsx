"use client";

import { useRef, useState } from "react";
import {
  Play,
  Star,
  FileText,
  Mic,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Video,
  Download,
  Loader2,
} from "lucide-react";
import type { Offer, Creative } from "@/lib/types";
import { LANGUAGE_LABELS, NICHE_EMOJI, NICHE_LABELS, TRAFFIC_LABELS } from "@/lib/types";
import { thumbGradient } from "@/lib/utils";
import { useToast } from "@/components/ui/toaster";

type CreativesSectionProps = {
  offer?: Offer;
  /** Criativos reais do DB (já filtrados por visible=true). Se vazio, renderiza placeholders. */
  creatives?: Creative[];
  /** Base gradient 1-20 pra variar os thumbs dos placeholders. */
  baseGradient: number;
};

const MOCK_DATES = [
  "03 de fev",
  "14 de set",
  "04 de dez",
  "16 de dez",
  "03 de fev",
  "21 de jan",
  "07 de mar",
  "19 de out",
];

export function CreativesSection({
  offer,
  creatives,
  baseGradient,
}: CreativesSectionProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hasReal = creatives && creatives.length > 0;
  const totalCount = creatives?.length ?? 0;

  const lang = offer ? LANGUAGE_LABELS[offer.language] : LANGUAGE_LABELS["pt-BR"];

  function scrollBy(dx: number) {
    scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  }

  return (
    <section className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
            Criativos
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollBy(-360)}
              className="grid place-items-center w-9 h-9 rounded-full border border-[var(--border-hairline)] text-text-2 hover:text-text hover:bg-[var(--bg-glass)] transition-colors"
              aria-label="Anterior"
            >
              <ChevronLeft size={14} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(360)}
              className="grid place-items-center w-9 h-9 rounded-full border border-[var(--border-hairline)] text-text-2 hover:text-text hover:bg-[var(--bg-glass)] transition-colors"
              aria-label="Próximo"
            >
              <ChevronRight size={14} strokeWidth={1.8} />
            </button>
          </div>
          <button
            type="button"
            className="grid place-items-center w-9 h-9 rounded-full bg-[var(--accent-soft)] border border-[var(--border-hairline)] text-text hover:bg-[var(--accent-glow)] transition-colors"
            aria-label="Analisar com IA"
          >
            <Sparkles size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="
              inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full
              border border-[var(--border-default)] text-[12px] font-medium
              text-text-2 hover:text-text hover:bg-[var(--bg-glass)] hover:border-[var(--border-strong)]
              transition-colors
            "
          >
            Ver todos
            <ArrowRight size={12} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollerRef}
        className="
          flex gap-3 overflow-x-auto pb-3
          snap-x snap-mandatory
          scrollbar-thin
        "
        style={{ scrollbarWidth: "thin" }}
      >
        {hasReal
          ? creatives.map((c, i) => (
              <CreativeCard
                key={c.id}
                index={i}
                number={i + 1}
                totalCount={totalCount}
                date={
                  c.published_at
                    ? new Date(c.published_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                      })
                    : MOCK_DATES[i % MOCK_DATES.length]
                }
                gradient={(baseGradient + i * 3) % 20 || 1}
                offer={offer}
                lang={lang}
                creative={c}
              />
            ))
          : (
            <div className="w-full py-8 glass rounded-[var(--r-lg)] text-center text-[13px] text-text-3">
              Nenhum criativo cadastrado ainda. Admin pode adicionar em
              <span className="mono"> /admin/offers/{offer?.slug ?? "[slug]"}/edit</span>.
            </div>
          )}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// creative card
// ────────────────────────────────────────────────────────────

function CreativeCard({
  index,
  number,
  totalCount,
  date,
  gradient,
  offer,
  lang,
  creative,
}: {
  index: number;
  number: number;
  totalCount?: number;
  date: string;
  gradient: number;
  offer?: Offer;
  lang: { flag: string; label: string };
  creative?: Creative;
}) {
  const [transcribing, setTranscribing] = useState(false);
  const { toast } = useToast();
  const [hasTranscript, setHasTranscript] = useState(!!creative?.transcript_text);
  const isAutomatic = index % 2 === 0;
  const ageDays = creative?.published_at
    ? Math.max(1, Math.floor(
        (Date.now() - new Date(creative.published_at).getTime()) /
          (1000 * 60 * 60 * 24)
      ))
    : 3 + (index % 5) * 2;

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const assetUrl = creative?.asset_url
    ? creative.asset_url.startsWith("http")
      ? creative.asset_url
      : `${supaUrl}/storage/v1/object/public/creatives/${creative.asset_url}`
    : null;
  const thumbUrl = creative?.thumbnail_url
    ? creative.thumbnail_url.startsWith("http")
      ? creative.thumbnail_url
      : `${supaUrl}/storage/v1/object/public/creatives/${creative.thumbnail_url}`
    : null;

  return (
    <article
      className="
        snap-start shrink-0
        w-[260px] md:w-[290px]
        glass rounded-[var(--r-lg)] p-3 flex flex-col gap-2.5
        transition-[transform,border-color] duration-[280ms] ease-[var(--ease-spring)]
        hover:-translate-y-[2px] hover:border-[var(--border-strong)]
      "
    >
      {/* Top row: count + star */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[11px] text-text-3">
          <FileText size={11} strokeWidth={1.6} />
          <span className="mono text-text font-medium">{totalCount ?? 0}</span> Criativos
        </span>
        <button
          type="button"
          className="p-1 rounded-full text-text-3 hover:text-text transition-colors"
          aria-label="Destacar criativo"
        >
          <Star size={13} strokeWidth={1.6} />
        </button>
      </div>

      {/* Meta chips: age + tags */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] text-text-3">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {ageDays} dias
        </span>
        {isAutomatic && (
          <span
            className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded text-[#6366F1]"
            style={{ background: "rgba(99,102,241,0.12)" }}
          >
            Automático
          </span>
        )}
        <span
          className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded text-[#F59E0B]"
          style={{ background: "rgba(245,158,11,0.12)" }}
        >
          Recente
        </span>
      </div>

      {/* Date */}
      <div className="text-[11px] text-text-3 font-medium">{date}</div>

      {/* Title + offer pill */}
      <div className="flex flex-col gap-1 items-center text-center">
        <h3 className="display text-[15px] font-semibold tracking-[-0.01em]">
          Criativo {number}
        </h3>
        {offer && (
          <span
            className="
              inline-flex items-center
              text-[10px] font-medium
              px-2 py-0.5 rounded-full
              text-[var(--success)]
              border border-[var(--success)]/30
            "
            style={{
              background: "color-mix(in srgb, var(--success) 10%, transparent)",
            }}
          >
            {offer.title}
          </span>
        )}
      </div>

      {/* Preview area (9:16 creative aspect) */}
      <div
        className="
          relative aspect-[9/16] rounded-[var(--r-md)] overflow-hidden
          border border-[var(--border-hairline)] bg-black
        "
        style={!creative ? { background: thumbGradient(gradient) } : undefined}
      >
        {creative ? (
          creative.kind === "video" && assetUrl ? (
            <video
              src={assetUrl}
              poster={thumbUrl ?? undefined}
              controls
              preload="metadata"
              playsInline
              className="w-full h-full object-contain"
            />
          ) : creative.kind === "image" && assetUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl}
              alt={creative.caption ?? ""}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-text-3">
              {creative.kind === "video" ? (
                <Video size={20} />
              ) : (
                <ImageIcon size={20} />
              )}
            </div>
          )
        ) : (
          <div
            className="
              absolute inset-0 grid place-items-center
              opacity-0 hover:opacity-100 transition-opacity duration-200
            "
            style={{
              background:
                "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%)",
            }}
          >
            <div
              className="
                w-11 h-11 rounded-full grid place-items-center border
                transition-transform duration-200 ease-[var(--ease-spring)]
                hover:scale-110
              "
              style={{
                background: "rgba(255,255,255,0.18)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                borderColor: "rgba(255,255,255,0.22)",
              }}
              aria-hidden="true"
            >
              <Play size={14} fill="white" strokeWidth={0} className="ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Metadata tags */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        {offer && (
          <>
            <Chip>
              <span className="shrink-0" aria-hidden="true">{NICHE_EMOJI[offer.niche]}</span>
              {NICHE_LABELS[offer.niche]}
            </Chip>
            <Chip>
              <FbIcon />
              {TRAFFIC_LABELS[offer.traffic_source]}
            </Chip>
            <Chip>
              <span aria-hidden="true">{lang.flag}</span>
              {lang.label.replace(/\s*\([^)]*\)/, "")}
            </Chip>
          </>
        )}
      </div>

      {/* Transcription button — dual state */}
      {creative && creative.kind === "video" ? (
        hasTranscript ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(
                `/api/creatives/${creative.id}/transcript`,
                "_blank"
              );
            }}
            className="
              mt-1 inline-flex items-center justify-center gap-1.5
              w-full px-3 py-2 rounded-[var(--r-sm)]
              text-[12px] font-medium text-[var(--success)]
              border border-[color-mix(in_srgb,var(--success)_30%,transparent)]
              bg-[color-mix(in_srgb,var(--success)_10%,transparent)]
              hover:bg-[color-mix(in_srgb,var(--success)_18%,transparent)]
              transition-colors
            "
            title="Baixar transcrição (.txt)"
          >
            <Download size={12} strokeWidth={1.8} />
            Baixar transcrição
          </button>
        ) : (
          <button
            type="button"
            disabled={transcribing}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (transcribing) return;
              setTranscribing(true);
              try {
                const res = await fetch(
                  `/api/admin/creatives/${creative.id}/transcribe`,
                  { method: "POST" }
                );
                const data = await res.json();
                if (!res.ok) {
                  toast({
                    kind: "error",
                    title: "Não consegui iniciar a transcrição",
                    description: data.error ?? "Falha ao enfileirar o job",
                  });
                  setTranscribing(false);
                  return;
                }
                const jobId = data.job_id as string;
                const start = Date.now();
                while (Date.now() - start < 300_000) {
                  await new Promise((r) => setTimeout(r, 3000));
                  const s = await fetch(`/api/admin/jobs/${jobId}`);
                  if (!s.ok) continue;
                  const j = await s.json();
                  if (j.status === "done") {
                    setHasTranscript(true);
                    toast({
                      kind: "success",
                      title: "Transcrição pronta",
                      description: "Já pode baixar pelo botão verde.",
                    });
                    break;
                  }
                  if (j.status === "error") {
                    toast({
                      kind: "error",
                      title: "Transcrição falhou",
                      description: j.error ?? "Erro do worker",
                    });
                    break;
                  }
                }
              } finally {
                setTranscribing(false);
              }
            }}
            className="
              mt-1 inline-flex items-center justify-center gap-1.5
              w-full px-3 py-2 rounded-[var(--r-sm)]
              bg-[var(--bg-elevated)] border border-[var(--border-hairline)]
              text-[12px] font-medium text-text-2 hover:text-text
              hover:bg-[var(--bg-glass)] hover:border-[var(--border-strong)]
              transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            title="Gerar transcrição via Whisper"
          >
            {transcribing ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Transcrevendo...
              </>
            ) : (
              <>
                <Mic size={12} strokeWidth={1.8} />
                Transcrever
              </>
            )}
          </button>
        )
      ) : (
        // Placeholder (sem creative real, ou imagem): mantém visual original
        <button
          type="button"
          disabled
          className="
            mt-1 inline-flex items-center justify-center gap-1.5
            w-full px-3 py-2 rounded-[var(--r-sm)]
            bg-[var(--bg-elevated)] border border-[var(--border-hairline)]
            text-[12px] font-medium text-text-3
            opacity-60 cursor-not-allowed
          "
        >
          <Mic size={12} strokeWidth={1.8} />
          Transcrição
        </button>
      )}
    </article>
  );
}

// ────────────────────────────────────────────────────────────
// chip

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-text-2 bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded">
      {children}
    </span>
  );
}

function FbIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-[#1877F2]">
      <path d="M24 12.073C24 5.446 18.627 0 12 0S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.791-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}
