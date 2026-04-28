"use client";

import { useEffect, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { thumbGradient } from "@/lib/utils";

type VslPlayerProps = {
  /** Slug da oferta — usado pra fetchar signed URL */
  slug?: string;
  /** Título da oferta (pra alt text acessível) */
  offerTitle?: string;
  /** Se oferta tem vídeo uploadado */
  hasVsl?: boolean;
  /** Thumb público (bucket thumbs) ou null */
  thumbnailPath?: string | null;
  /** Fallback gradient (1-20) pra placeholder quando sem vídeo */
  thumbGradientNumber: number;
};

/**
 * Constrói URL pública do thumb a partir do path no bucket `thumbs`.
 * Retorna null se env var faltando ou path vazio — evita URLs quebradas
 * tipo "undefined/storage/..." que apareciam antes.
 */
function buildThumbUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    if (typeof window !== "undefined") {
      console.warn(
        "[VslPlayer] NEXT_PUBLIC_SUPABASE_URL não configurado — thumb não será renderizado"
      );
    }
    return null;
  }
  // Passa pelo render endpoint pra entregar WebP comprimido no poster.
  return `${base}/storage/v1/render/image/public/thumbs/${path}?width=800&quality=80&resize=cover`;
}

// ─────────────────────────────────────────────────────────────
// Signed URL cache — localStorage com expiry
// URLs assinadas duram 60min no servidor; guardamos 55min pra margem.
// ─────────────────────────────────────────────────────────────

const VSL_URL_CACHE_TTL_MS = 55 * 60 * 1000; // 55min

function cacheKey(slug: string): string {
  return `bbs:vsl-url:${slug}`;
}

function readCachedVslUrl(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(slug));
    if (!raw) return null;
    const { url, expiresAt } = JSON.parse(raw) as {
      url: string;
      expiresAt: number;
    };
    if (!url || Date.now() > expiresAt) {
      localStorage.removeItem(cacheKey(slug));
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function writeCachedVslUrl(slug: string, url: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      cacheKey(slug),
      JSON.stringify({
        url,
        expiresAt: Date.now() + VSL_URL_CACHE_TTL_MS,
      })
    );
  } catch {
    // localStorage cheio ou desabilitado — apenas ignora
  }
}

export function VslPlayer({
  slug,
  offerTitle,
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
      // 1. Tenta pegar URL cached no localStorage (válida por até 55min)
      const cached = readCachedVslUrl(slug);
      if (cached) {
        setSignedUrl(cached);
        setStarted(true);
        return;
      }
      // 2. Cache miss → fetcha do servidor
      const res = await fetch(`/api/offer/${slug}/vsl-url`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { url: string };
      setSignedUrl(data.url);
      setStarted(true);
      writeCachedVslUrl(slug, data.url);
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
  if (started && signedUrl && !errored) {
    const posterUrl = buildThumbUrl(thumbnailPath) ?? undefined;

    return (
      <div className="relative rounded-[var(--r-xl)] overflow-hidden aspect-[16/10] border border-[var(--border-hairline)] bg-black">
        <video
          src={signedUrl}
          poster={posterUrl}
          controls
          autoPlay
          preload="metadata"
          playsInline
          className="w-full h-full object-contain"
          onError={() => {
            // Reset pro estado idle pro user clicar play de novo
            setErrored(true);
            setStarted(false);
            setSignedUrl(null);
          }}
        >
          Seu navegador não suporta vídeo HTML5.
        </video>
      </div>
    );
  }

  // Estado idle: thumb + botão grande pra play
  const posterUrl = buildThumbUrl(thumbnailPath);

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
          alt={
            offerTitle ? `Capa do VSL de ${offerTitle}` : "Capa do vídeo"
          }
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
        <div className="absolute bottom-4 left-4 right-4 z-30 flex justify-center">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-[var(--error)] border border-[var(--error)]/30"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
          >
            Erro ao carregar · toca no play pra tentar de novo
          </span>
        </div>
      )}
    </button>
  );
}
