"use client";

import { useEffect, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { thumbGradient } from "@/lib/utils";

type VslPlayerProps = {
  /** Slug da oferta — usado pra fetchar signed URL */
  slug?: string;
  /** Se oferta tem vídeo uploadado */
  hasVsl?: boolean;
  /** Thumb público (bucket thumbs) ou null */
  thumbnailPath?: string | null;
  /** Fallback gradient (1-20) pra placeholder quando sem vídeo */
  thumbGradientNumber: number;
};

export function VslPlayer({
  slug,
  hasVsl,
  thumbnailPath,
  thumbGradientNumber,
}: VslPlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [started, setStarted] = useState(false);

  async function handleStart() {
    if (!slug || !hasVsl || loading || signedUrl) return;
    setLoading(true);
    setErrored(false);
    try {
      const res = await fetch(`/api/offer/${slug}/vsl-url`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { url: string };
      setSignedUrl(data.url);
      setStarted(true);
    } catch (err) {
      console.error("vsl-url fetch failed:", err);
      setErrored(true);
    } finally {
      setLoading(false);
    }
  }

  // se não tem VSL, renderiza o placeholder antigo
  if (!hasVsl || !slug) {
    return (
      <div className="relative rounded-[var(--r-xl)] overflow-hidden aspect-[16/10] border border-[var(--border-hairline)]">
        <div
          className="absolute -inset-[40%] pointer-events-none z-0"
          style={{
            background:
              "radial-gradient(circle at center, var(--accent-glow) 0%, transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 grid place-items-center z-10"
          style={{ background: thumbGradient(thumbGradientNumber) }}
        >
          <div
            className="w-[72px] h-[72px] rounded-full grid place-items-center border"
            style={{
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderColor: "rgba(255,255,255,0.25)",
            }}
            aria-hidden="true"
          >
            <Play size={24} fill="white" strokeWidth={0} className="ml-1" />
          </div>
          <div className="absolute bottom-4 left-4 right-4 text-center">
            <span className="text-[11px] text-white/50 uppercase tracking-[0.14em] font-semibold">
              Preview indisponível
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Se já carregou signed URL, renderiza <video>
  if (started && signedUrl) {
    const posterUrl = thumbnailPath
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbs/${thumbnailPath}`
      : undefined;

    return (
      <div className="relative rounded-[var(--r-xl)] overflow-hidden aspect-[16/10] border border-[var(--border-hairline)] bg-black">
        <video
          src={signedUrl}
          poster={posterUrl}
          controls
          autoPlay
          preload="metadata"
          className="w-full h-full object-contain"
          onError={() => setErrored(true)}
        >
          Seu navegador não suporta vídeo HTML5.
        </video>
      </div>
    );
  }

  // Estado idle: thumb + botão grande pra play
  const posterUrl = thumbnailPath
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbs/${thumbnailPath}`
    : null;

  return (
    <button
      type="button"
      onClick={handleStart}
      className="relative rounded-[var(--r-xl)] overflow-hidden aspect-[16/10] border border-[var(--border-hairline)] cursor-pointer group w-full"
      aria-label="Reproduzir vídeo"
    >
      <div
        className="absolute -inset-[40%] pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(circle at center, var(--accent-glow) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />

      {/* Thumb */}
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover z-[5]"
        />
      ) : (
        <div
          className="absolute inset-0 z-[5]"
          style={{ background: thumbGradient(thumbGradientNumber) }}
        />
      )}

      {/* Overlay escuro */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%)",
        }}
        aria-hidden="true"
      />

      {/* Play button */}
      <div className="absolute inset-0 grid place-items-center z-20">
        <div
          className="w-[72px] h-[72px] rounded-full grid place-items-center border transition-transform duration-200 ease-[var(--ease-spring)] group-hover:scale-110"
          style={{
            background: "rgba(255,255,255,0.2)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderColor: "rgba(255,255,255,0.25)",
          }}
          aria-hidden="true"
        >
          {loading ? (
            <Loader2 size={24} strokeWidth={2} className="text-white animate-spin" />
          ) : (
            <Play size={24} fill="white" strokeWidth={0} className="ml-1" />
          )}
        </div>
      </div>

      {errored && (
        <div className="absolute bottom-4 left-4 right-4 z-30 text-center">
          <span className="text-[12px] text-[var(--error)] font-medium">
            Erro ao carregar vídeo. Tenta de novo.
          </span>
        </div>
      )}
    </button>
  );
}
