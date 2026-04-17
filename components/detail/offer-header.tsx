"use client";

import { Sparkles } from "lucide-react";
import type { Offer } from "@/lib/types";
import {
  LANGUAGE_LABELS,
  NICHE_LABELS,
  STATUS_LABELS,
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
} from "@/lib/types";
import { OfferPill } from "@/components/offers/offer-pill";

export function OfferHeader({ offer }: { offer: Offer }) {
  const lang = LANGUAGE_LABELS[offer.language];
  const statusVariant =
    offer.status === "active" ? "success" : offer.status === "paused" ? "error" : "default";

  return (
    <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
      <div className="flex-1 min-w-0">
        <h1 className="display text-[32px] md:text-[40px] font-bold tracking-[-0.035em] leading-[1.05] mb-4">
          {offer.title}
        </h1>

        <div className="flex items-center flex-wrap gap-1.5">
          <OfferPill size="sm">{STRUCTURE_LABELS[offer.structure]}</OfferPill>
          <OfferPill size="sm">{NICHE_LABELS[offer.niche]}</OfferPill>
          <OfferPill size="sm">
            <span aria-hidden="true">{lang.flag}</span>
            {lang.label.replace(/\s*\([^)]*\)/, "")}
          </OfferPill>
          <OfferPill size="sm">{TRAFFIC_LABELS[offer.traffic_source]}</OfferPill>
          <OfferPill size="sm" variant={statusVariant} dot={offer.status === "active"}>
            {STATUS_LABELS[offer.status]}
          </OfferPill>
        </div>
      </div>

      <button
        type="button"
        className="
          group shrink-0
          inline-flex items-center gap-2
          px-5 py-2.5
          rounded-full
          bg-[var(--accent)] text-black font-medium text-[14px]
          shadow-[0_4px_20px_var(--accent-glow),inset_0_1px_0_rgba(255,255,255,0.4)]
          transition-[transform,box-shadow,background] duration-200 ease-[var(--ease-spring)]
          hover:scale-[1.02] hover:-translate-y-[1px]
          hover:shadow-[0_8px_32px_var(--accent-glow),inset_0_1px_0_rgba(255,255,255,0.5)]
          active:scale-[0.97]
          tracking-[-0.01em]
        "
      >
        <Sparkles size={15} strokeWidth={1.8} />
        Analise com IA
      </button>
    </header>
  );
}
