"use client";

import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import type { Offer } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

/**
 * Agrupa frases em parágrafos de 2 frases cada, pra leitura confortável.
 * Se a string não tiver pontuação clara, retorna como 1 só parágrafo.
 */
function groupSentences(text: string, sentencesPerParagraph = 2): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.length === 0) return [text];
  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
    groups.push(sentences.slice(i, i + sentencesPerParagraph).join(" "));
  }
  return groups;
}

function fmtTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Distribui timestamps pelos parágrafos proporcional ao tamanho de cada um
 * (caracteres). Mais preciso que divisão uniforme — parágrafo maior = mais
 * tempo de leitura. Não é exato sem Whisper segments, por isso o prefix "~".
 *
 * Retorna array com o timestamp de INÍCIO de cada parágrafo.
 */
function distributeTimestamps(
  paragraphs: string[],
  totalSeconds: number
): number[] {
  if (totalSeconds <= 0 || paragraphs.length === 0)
    return paragraphs.map(() => 0);

  const lengths = paragraphs.map((p) => p.length);
  const totalChars = lengths.reduce((s, n) => s + n, 0);
  if (totalChars === 0) return paragraphs.map(() => 0);

  const result: number[] = [];
  let accChars = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    result.push((accChars / totalChars) * totalSeconds);
    accChars += lengths[i];
  }
  return result;
}

export function TranscriptSection({ offer }: { offer: Offer }) {
  const [expanded, setExpanded] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (!offer.transcript_preview && !offer.transcript_text) {
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

  // Full text > preview. Quando expandido usa o full, senão o preview.
  const fullText = offer.transcript_text ?? offer.transcript_preview ?? "";
  const previewText = offer.transcript_preview ?? fullText.slice(0, 500);
  const activeText = expanded ? fullText : previewText;
  const hasMore = !!offer.transcript_text && fullText.length > previewText.length;

  const paragraphs = groupSentences(activeText, 2);
  const duration = offer.vsl_duration_seconds ?? 0;
  const timestamps = distributeTimestamps(paragraphs, duration);

  async function copyText(text: string, cb: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      cb();
    } catch (err) {
      console.error("clipboard error:", err);
    }
  }

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
            onClick={() =>
              copyText(fullText, () => {
                setCopiedAll(true);
                setTimeout(() => setCopiedAll(false), 2000);
              })
            }
            className="
              inline-flex items-center gap-2 px-3 py-2 rounded-[var(--r-sm)]
              text-[12px] font-medium text-text-2
              hover:text-text hover:bg-[var(--bg-glass)]
              transition-[background,color] duration-200
            "
          >
            {copiedAll ? (
              <>
                <Check size={13} strokeWidth={2} className="text-[var(--success)]" />
                Copiado
              </>
            ) : (
              <>
                <Copy size={13} strokeWidth={1.5} />
                Copiar tudo
              </>
            )}
          </button>
        </div>
      </div>

      <div className="glass rounded-[var(--r-lg)] p-6 flex flex-col gap-4">
        {paragraphs.map((p, i) => {
          const t = timestamps[i] ?? 0;
          return (
            <div key={i} className="group flex gap-3 items-start">
              <span
                className="mono text-[11px] text-text-4 tabular-nums shrink-0 w-10 pt-1"
                title="Timestamp aproximado — estimado pelo tamanho do trecho"
              >
                {duration > 0 ? `~${fmtTimestamp(t)}` : "—"}
              </span>
              <p className="text-[14px] leading-relaxed text-text-2 flex-1">{p}</p>
              <button
                type="button"
                onClick={() =>
                  copyText(p, () => {
                    setCopiedIdx(i);
                    setTimeout(() => setCopiedIdx(null), 1500);
                  })
                }
                className="
                  opacity-0 group-hover:opacity-100
                  p-1.5 rounded-[var(--r-sm)]
                  text-text-3 hover:text-text hover:bg-[var(--bg-elevated)]
                  transition-all duration-200
                "
                aria-label="Copiar trecho"
              >
                {copiedIdx === i ? (
                  <Check size={12} strokeWidth={2} className="text-[var(--success)]" />
                ) : (
                  <Copy size={12} strokeWidth={1.5} />
                )}
              </button>
            </div>
          );
        })}

        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="
              mt-2 self-start
              inline-flex items-center gap-1.5
              px-3 py-2 rounded-full
              text-[12px] font-medium text-text-2
              hover:text-text hover:bg-[var(--bg-glass)]
              transition-[background,color] duration-200
            "
          >
            {expanded ? "Recolher" : "Ver transcrição completa"}
            {expanded ? (
              <ChevronUp size={13} strokeWidth={1.8} />
            ) : (
              <ChevronDown size={13} strokeWidth={1.8} />
            )}
          </button>
        )}
      </div>
    </section>
  );
}
