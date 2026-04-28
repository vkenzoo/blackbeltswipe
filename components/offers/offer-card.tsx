"use client";

import Link from "next/link";
import { Heart, Sparkles, Star, Play, FileText } from "lucide-react";
import type { Offer } from "@/lib/types";
import {
  LANGUAGE_LABELS,
  NICHE_EMOJI,
  NICHE_LABELS,
  STATUS_LABELS,
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
} from "@/lib/types";
import { formatDateShort, thumbGradient } from "@/lib/utils";
import { thumbUrl, thumbSrcSet } from "@/lib/image";
import { OfferPill } from "./offer-pill";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** MM:SS ou H:MM:SS (YouTube-style) */
function formatDurationChip(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

type OfferCardProps = {
  offer: Offer;
};

export function OfferCard({ offer }: OfferCardProps) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [starred, setStarred] = useState(false);
  const [prefetched, setPrefetched] = useState(false);
  const lang = LANGUAGE_LABELS[offer.language];
  const statusVariant =
    offer.status === "active" ? "success" : offer.status === "paused" ? "error" : "default";
  const isHot = offer.flags?.includes("escalando");

  // Pré-carrega a detail page quando mouse entra — nav fica quase instantânea.
  // Evita refetch se o user varre rápido os cards (throttle via state).
  const handleMouseEnter = () => {
    if (prefetched) return;
    router.prefetch(`/app/${offer.slug}`);
    setPrefetched(true);
  };

  return (
    <Link
      href={`/app/${offer.slug}`}
      prefetch={true}
      onMouseEnter={handleMouseEnter}
      onFocus={handleMouseEnter}
      className={`
        group
        relative block
        glass
        rounded-[var(--r-xl)]
        p-4
        offer-card-hover
        offer-card-optim
        ${isHot ? "offer-card-hot" : ""}
        flex flex-col gap-3
      `}
    >
      {/* Top row: date (esquerda) + action icons (direita) */}
      <div className="flex items-center justify-between">
        <span className="caption mono tabular-nums">
          {offer.launched_at ? formatDateShort(offer.launched_at) : ""}
        </span>
        <div className="flex items-center gap-0.5 text-text-3">
          {offer.transcript_preview && (
            <button
              type="button"
              onClick={(e) => e.preventDefault()}
              className="icon-hover pressable grid place-items-center w-7 h-7 rounded-full hover:text-text hover:bg-[var(--bg-elevated)]"
              aria-label="Transcrição disponível"
              title={`Transcrição · ${offer.vsl_duration_seconds ? Math.round(offer.vsl_duration_seconds / 60) + "min" : ""}`}
            >
              <FileText size={13} strokeWidth={1.6} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => e.preventDefault()}
            className="icon-hover pressable grid place-items-center w-7 h-7 rounded-full text-accent hover:bg-[var(--bg-elevated)]"
            aria-label="Analisar com IA"
          >
            <Sparkles size={13} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setFavorited((v) => !v);
            }}
            className="icon-hover pressable grid place-items-center w-7 h-7 rounded-full hover:text-text hover:bg-[var(--bg-elevated)]"
            aria-label={favorited ? "Remover favorito" : "Favoritar"}
            aria-pressed={favorited}
          >
            <Heart
              size={13}
              strokeWidth={1.6}
              fill={favorited ? "currentColor" : "none"}
              className={favorited ? "text-[var(--error)]" : ""}
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setStarred((v) => !v);
            }}
            className="icon-hover pressable grid place-items-center w-7 h-7 rounded-full hover:text-text hover:bg-[var(--bg-elevated)]"
            aria-label={starred ? "Remover destaque" : "Destacar"}
            aria-pressed={starred}
          >
            <Star
              size={13}
              strokeWidth={1.6}
              fill={starred ? "currentColor" : "none"}
              className={starred ? "text-[var(--warning)]" : ""}
            />
          </button>
        </div>
      </div>

      {/* Title + pills (centered, creative-card style) */}
      <div className="flex flex-col gap-1.5 items-center text-center">
        <h3 className="display-md line-clamp-2">
          {offer.title}
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <span
            className="
              inline-flex items-center gap-1
              text-[10px] font-medium
              px-2 py-0.5 rounded-full
              text-[var(--success)]
              border border-[var(--success)]/30
            "
            style={{
              background: "color-mix(in srgb, var(--success) 10%, transparent)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--success)" }}
              aria-hidden="true"
            />
            {NICHE_LABELS[offer.niche]}
          </span>
          <OfferPill
            variant={statusVariant}
            size="sm"
            dot={offer.status === "active"}
          >
            {STATUS_LABELS[offer.status]}
          </OfferPill>
        </div>
      </div>

      {/* Thumbnail preview */}
      <div
        className="
          relative aspect-[16/10] rounded-[var(--r-md)] overflow-hidden
          border border-[var(--border-hairline)]
        "
        style={
          offer.vsl_thumbnail_path
            ? undefined
            : { background: thumbGradient(offer.thumb_gradient) }
        }
      >
        {offer.vsl_thumbnail_path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl(offer.vsl_thumbnail_path, { width: 400 }) ?? undefined}
            srcSet={thumbSrcSet(offer.vsl_thumbnail_path, 400)}
            alt={`Capa do VSL de ${offer.title}`}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-[400ms] ease-[var(--ease-spring)] group-hover:scale-[1.03]"
          />
        )}

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.5) 100%)",
          }}
          aria-hidden="true"
        />

        {/* Duration chip bottom-right */}
        {offer.vsl_duration_seconds && offer.vsl_duration_seconds > 0 && (
          <span
            className="
              absolute bottom-2 right-2 z-10
              mono text-[10px] font-semibold text-white
              px-1.5 py-0.5 rounded tabular-nums
            "
            style={{
              background: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(4px)",
              letterSpacing: "0.02em",
            }}
          >
            {formatDurationChip(offer.vsl_duration_seconds)}
          </span>
        )}

        {/* Play button */}
        <div
          className="
            absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-11 h-11 rounded-full
            grid place-items-center border
            transition-all duration-[280ms] ease-[var(--ease-spring)]
            group-hover:scale-110 group-hover:bg-[var(--accent)] group-hover:border-[var(--accent)]
          "
          style={{
            background: "rgba(255,255,255,0.18)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            borderColor: "rgba(255,255,255,0.22)",
          }}
          aria-hidden="true"
        >
          <Play
            size={14}
            fill="white"
            strokeWidth={0}
            className="group-hover:fill-black transition-colors ml-0.5"
          />
        </div>
      </div>

      {/* Metadata chips row (bottom) — estilo creative card */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap mt-1">
        <Chip>
          <FbIcon />
          {TRAFFIC_LABELS[offer.traffic_source]}
        </Chip>
        <Chip>
          {STRUCTURE_LABELS[offer.structure]}
        </Chip>
        <Chip>
          <span aria-hidden="true" className="text-[12px] leading-none">{lang.flag}</span>
          {lang.label.replace(/\s*\([^)]*\)/, "")}
        </Chip>
      </div>
    </Link>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="
        inline-flex items-center gap-1
        text-[10.5px] font-medium text-text-2
        px-2 py-0.5 rounded-full
        border border-[var(--border-hairline)]
        bg-[color-mix(in_srgb,var(--bg-elevated)_70%,transparent)]
      "
    >
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
