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
import { formatDateShort, formatNumber, thumbGradient } from "@/lib/utils";
import { OfferPill } from "./offer-pill";
import { useState } from "react";

type OfferCardProps = {
  offer: Offer;
};

export function OfferCard({ offer }: OfferCardProps) {
  const [favorited, setFavorited] = useState(false);
  const [starred, setStarred] = useState(false);
  const lang = LANGUAGE_LABELS[offer.language];
  const statusVariant =
    offer.status === "active" ? "success" : offer.status === "paused" ? "error" : "default";

  return (
    <Link
      href={`/app/${offer.slug}`}
      className="
        group
        relative block
        glass
        rounded-[var(--r-lg)]
        p-4
        transition-[transform,border-color,background,box-shadow]
        duration-[280ms] ease-[var(--ease-spring)]
        hover:-translate-y-[3px] hover:scale-[1.015]
        hover:bg-[var(--bg-glass-hover)]
        hover:border-[var(--border-strong)]
        focus:outline-none
      "
      style={
        {
          // hover shadow via style (can't do multi-shadow in hover easily in Tailwind 4 defaults)
        }
      }
    >
      {/* Top row: ad count + icons */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] text-text-2">
          <span className="mono text-text font-medium">
            {formatNumber(offer.ad_count)}
          </span>{" "}
          <span className="text-text-3">anúncios</span>
        </span>

        <div className="flex items-center gap-2 text-text-3">
          {offer.transcript_preview && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
              }}
              className="hover:text-text transition-colors duration-150"
              aria-label="Transcrição disponível"
              title={`Transcrição · ${offer.transcript_duration ? Math.round(offer.transcript_duration / 60) + "min" : ""}`}
            >
              <FileText size={15} strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
            }}
            className="text-accent hover:scale-110 transition-transform duration-150 ease-[var(--ease-spring)]"
            aria-label="Analisar com IA"
          >
            <Sparkles size={15} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setFavorited((v) => !v);
            }}
            className="hover:text-text hover:scale-110 transition-all duration-150 ease-[var(--ease-spring)]"
            aria-label={favorited ? "Remover favorito" : "Favoritar"}
            aria-pressed={favorited}
          >
            <Heart
              size={15}
              strokeWidth={1.5}
              fill={favorited ? "currentColor" : "none"}
              className={favorited ? "text-text" : ""}
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setStarred((v) => !v);
            }}
            className="hover:text-text hover:scale-110 transition-all duration-150 ease-[var(--ease-spring)]"
            aria-label={starred ? "Remover destaque" : "Destacar"}
            aria-pressed={starred}
          >
            <Star
              size={15}
              strokeWidth={1.5}
              fill={starred ? "currentColor" : "none"}
              className={starred ? "text-text" : ""}
            />
          </button>
        </div>
      </div>

      {/* Meta row: date + status pill */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] text-text-3">
          {formatDateShort(offer.launched_at)}
        </span>
        <OfferPill variant={statusVariant} size="sm" dot={offer.status === "active"}>
          {STATUS_LABELS[offer.status]}
        </OfferPill>
      </div>

      {/* Title */}
      <h3 className="display text-[17px] font-semibold mb-2.5 leading-snug">
        {offer.title}
      </h3>

      {/* Niche pill */}
      <div className="mb-3.5">
        <OfferPill variant="niche" size="sm">
          <span aria-hidden="true">{NICHE_EMOJI[offer.niche]}</span>
          {NICHE_LABELS[offer.niche]}
        </OfferPill>
      </div>

      {/* Thumbnail */}
      <div
        className="
          relative aspect-[16/10] rounded-[var(--r-md)] mb-3.5 overflow-hidden
          border border-[var(--border-hairline)]
        "
        style={{ background: thumbGradient(offer.thumb_gradient) }}
      >
        {/* Dark overlay bottom */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.4) 100%)",
          }}
          aria-hidden="true"
        />

        {/* Play button */}
        <div
          className="
            absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-11 h-11 rounded-full
            grid place-items-center
            border
            transition-all duration-[280ms] ease-[var(--ease-spring)]
            group-hover:scale-110 group-hover:bg-[var(--accent)] group-hover:border-[var(--accent)]
          "
          style={{
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            borderColor: "rgba(255,255,255,0.2)",
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

      {/* Bottom pills (meta tags) */}
      <div className="text-[11px] text-text-3 mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>{TRAFFIC_LABELS[offer.traffic_source]}</span>
        <span className="text-text-4">·</span>
        <span>{STRUCTURE_LABELS[offer.structure]}</span>
        {offer.niche !== "renda_extra" && (
          <>
            <span className="text-text-4">·</span>
            <span>{NICHE_LABELS[offer.niche]}</span>
          </>
        )}
      </div>

      {/* Language */}
      <div className="flex items-center gap-2 text-[12px] text-text-2">
        <span aria-hidden="true">{lang.flag}</span>
        <span>{lang.label}</span>
      </div>
    </Link>
  );
}
