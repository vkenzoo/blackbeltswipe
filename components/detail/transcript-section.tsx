"use client";

import { useState } from "react";
import { Copy, FileText, ChevronDown } from "lucide-react";
import type { Offer } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function TranscriptSection({ offer }: { offer: Offer }) {
  const [expanded, setExpanded] = useState(false);

  if (!offer.transcript_preview) {
    return (
      <section className="flex flex-col gap-4">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
            Transcrição
          </div>
          <h2 className="display text-[22px] font-semibold tracking-[-0.03em]">
            Não disponível ainda
          </h2>
        </div>
        <div className="glass rounded-[var(--r-lg)] p-6 text-[13px] text-text-2">
          Esta oferta ainda não foi transcrita. Logo estará disponível.
        </div>
      </section>
    );
  }

  // Split transcript into sentences for nicer paragraph display
  const paragraphs = offer.transcript_preview
    .split(/(?<=[.!?])\s+/)
    .reduce<string[]>((acc, sentence, i) => {
      const idx = Math.floor(i / 2);
      acc[idx] = (acc[idx] || "") + (acc[idx] ? " " : "") + sentence;
      return acc;
    }, []);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
            Transcrição
          </div>
          <h2 className="display text-[22px] font-semibold tracking-[-0.03em]">
            {offer.vsl_duration_seconds &&
              `${formatDuration(offer.vsl_duration_seconds)} · `}
            texto completo
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="
              inline-flex items-center gap-2 px-3 py-2 rounded-[var(--r-sm)]
              text-[12px] font-medium text-text-2
              hover:text-text hover:bg-[var(--bg-glass)]
              transition-[background,color] duration-200
            "
          >
            <Copy size={13} strokeWidth={1.5} />
            Copiar tudo
          </button>
        </div>
      </div>

      <div className="glass rounded-[var(--r-lg)] p-6 flex flex-col gap-4">
        {paragraphs.map((p, i) => (
          <div key={i} className="group flex gap-3 items-start">
            <span className="mono text-[11px] text-text-4 tabular-nums shrink-0 w-10 pt-1">
              {String(Math.floor((offer.vsl_duration_seconds ?? 0) * (i / paragraphs.length) / 60)).padStart(2, "0")}
              :{String(Math.floor((offer.vsl_duration_seconds ?? 0) * (i / paragraphs.length) % 60)).padStart(2, "0")}
            </span>
            <p className="text-[14px] leading-relaxed text-text-2 flex-1">{p}</p>
            <button
              type="button"
              className="
                opacity-0 group-hover:opacity-100
                p-1.5 rounded-[var(--r-sm)]
                text-text-3 hover:text-text hover:bg-[var(--bg-elevated)]
                transition-all duration-200
              "
              aria-label="Copiar trecho"
            >
              <Copy size={12} strokeWidth={1.5} />
            </button>
          </div>
        ))}

        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="
              mt-2 self-start
              inline-flex items-center gap-1.5
              px-3 py-2 rounded-full
              text-[12px] font-medium text-text-2
              hover:text-text hover:bg-[var(--bg-glass)]
              transition-[background,color] duration-200
            "
          >
            Ver transcrição completa
            <ChevronDown size={13} strokeWidth={1.8} />
          </button>
        )}
      </div>
    </section>
  );
}
