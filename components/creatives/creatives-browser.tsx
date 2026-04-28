"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Search,
  X,
  Video,
  Image as ImageIcon,
  Play,
  FileText,
  Download,
  Loader2,
} from "lucide-react";
import {
  LANGUAGE_LABELS,
  NICHE_EMOJI,
  NICHE_LABELS,
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
  type Niche,
  type Language,
  type OfferStructure,
  type TrafficSource,
  type CreativeKind,
} from "@/lib/types";
import { useToast } from "@/components/ui/toaster";

type OfferLite = {
  id: string;
  slug: string;
  title: string;
  niche: Niche;
  language: Language;
  structure: OfferStructure;
  traffic_source: TrafficSource;
  status: string;
  thumb_gradient: number;
};

type CreativeWithOffer = {
  id: string;
  offer_id: string;
  kind: CreativeKind;
  asset_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  captured_at: string;
  caption: string | null;
  published_at: string | null;
  visible: boolean;
  display_order: number;
  transcript_text: string | null;
  transcribed_at: string | null;
  offer: OfferLite;
};

type Filters = {
  search: string;
  kind: CreativeKind | "";
  niche: Niche | "";
  language: Language | "";
  structure: OfferStructure | "";
  traffic: TrafficSource | "";
};

const EMPTY: Filters = {
  search: "",
  kind: "",
  niche: "",
  language: "",
  structure: "",
  traffic: "",
};

const selectStyle = `
  h-9 px-3 pr-8 text-[12px] font-medium
  glass-light rounded-full
  text-text appearance-none cursor-pointer
  bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23A1A1A6%22 stroke-width=%221.8%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]
  bg-no-repeat bg-[right_12px_center]
  hover:bg-[var(--bg-glass-hover)]
  transition-colors
`;

export function CreativesBrowser({
  creatives,
}: {
  creatives: CreativeWithOffer[];
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clear() {
    setFilters(EMPTY);
  }

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return creatives.filter((c) => {
      if (search) {
        const haystack = `${c.caption ?? ""} ${c.offer.title} ${c.offer.slug}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (filters.kind && c.kind !== filters.kind) return false;
      if (filters.niche && c.offer.niche !== filters.niche) return false;
      if (filters.language && c.offer.language !== filters.language) return false;
      if (filters.structure && c.offer.structure !== filters.structure) return false;
      if (filters.traffic && c.offer.traffic_source !== filters.traffic) return false;
      return true;
    });
  }, [creatives, filters]);

  const activeCount = [
    filters.search.trim(),
    filters.kind,
    filters.niche,
    filters.language,
    filters.structure,
    filters.traffic,
  ].filter(Boolean).length;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search
            size={13}
            strokeWidth={1.8}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="Buscar criativos..."
            className="
              w-56 h-9 pl-8 pr-3 text-[13px]
              glass-light rounded-full text-text placeholder:text-text-3
              focus:outline-none focus:border-[var(--accent)]
            "
          />
        </div>

        <select
          value={filters.kind}
          onChange={(e) => update("kind", e.target.value as CreativeKind | "")}
          className={selectStyle}
        >
          <option value="">Todos tipos</option>
          <option value="video">🎥 Vídeo</option>
          <option value="image">🖼️ Imagem</option>
        </select>

        <select
          value={filters.niche}
          onChange={(e) => update("niche", e.target.value as Niche | "")}
          className={selectStyle}
        >
          <option value="">🌱 Todos nichos</option>
          {Object.entries(NICHE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {NICHE_EMOJI[k as Niche]} {v}
            </option>
          ))}
        </select>

        <select
          value={filters.language}
          onChange={(e) => update("language", e.target.value as Language | "")}
          className={selectStyle}
        >
          <option value="">🌐 Todos idiomas</option>
          {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.flag} {v.label.replace(/\s*\([^)]*\)/, "")}
            </option>
          ))}
        </select>

        <select
          value={filters.structure}
          onChange={(e) => update("structure", e.target.value as OfferStructure | "")}
          className={selectStyle}
        >
          <option value="">Todas estruturas</option>
          {Object.entries(STRUCTURE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          value={filters.traffic}
          onChange={(e) => update("traffic", e.target.value as TrafficSource | "")}
          className={selectStyle}
        >
          <option value="">Todo tráfego</option>
          {Object.entries(TRAFFIC_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="
              inline-flex items-center gap-1.5 h-9 px-3 rounded-full
              text-[12px] font-medium text-[var(--error)]
              hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]
              transition-colors
            "
          >
            <X size={12} strokeWidth={2} />
            Limpar ({activeCount})
          </button>
        )}
      </div>

      {activeCount > 0 && (
        <div className="text-[12px] text-text-3 -mt-2">
          {filtered.length} criativo{filtered.length === 1 ? "" : "s"} encontrado{filtered.length === 1 ? "" : "s"}
          {filtered.length !== creatives.length && ` de ${creatives.length} total`}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="glass rounded-[var(--r-lg)] p-12 text-center">
          <p className="text-[14px] text-text-2">
            {creatives.length === 0
              ? "Nenhum criativo cadastrado ainda."
              : "Nenhum criativo bate com os filtros atuais."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((c) => (
            <CreativeThumb key={c.id} creative={c} />
          ))}
        </div>
      )}
    </>
  );
}

function CreativeThumb({ creative }: { creative: CreativeWithOffer }) {
  const [transcribing, setTranscribing] = useState(false);
  const { toast } = useToast();
  const [hasTranscript, setHasTranscript] = useState(!!creative.transcript_text);
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const assetUrl = creative.asset_url.startsWith("http")
    ? creative.asset_url
    : `${supaUrl}/storage/v1/object/public/creatives/${creative.asset_url}`;
  // Thumb otimizada: se for path do Storage (não URL externa), passa pelo
  // render endpoint pra entregar WebP 360px em vez de original full-size.
  const thumbUrl = creative.thumbnail_url
    ? creative.thumbnail_url.startsWith("http")
      ? creative.thumbnail_url
      : `${supaUrl}/storage/v1/render/image/public/creatives/${creative.thumbnail_url}?width=360&quality=75&resize=cover`
    : null;

  return (
    <Link
      href={`/app/${creative.offer.slug}`}
      className="
        group glass rounded-[var(--r-md)] overflow-hidden flex flex-col gap-2 p-2
        transition-[transform,border-color] duration-[280ms] ease-[var(--ease-spring)]
        hover:-translate-y-[2px] hover:border-[var(--border-strong)]
      "
    >
      <div className="relative aspect-[9/16] rounded-[var(--r-sm)] overflow-hidden border border-[var(--border-hairline)] bg-black">
        {creative.kind === "video" && assetUrl ? (
          <>
            {thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl}
                alt={`Preview do criativo em vídeo de ${creative.offer.title}`}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              // Sem thumb dedicada — usa o próprio video com preload=metadata.
              // Browser baixa só ~100KB pra renderizar o 1º frame como poster.
              // Hover: reproduz muted pra preview live.
              <video
                src={assetUrl}
                preload="metadata"
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                onMouseEnter={(e) => {
                  const v = e.currentTarget;
                  // Não resetar ao re-entrar: se voltou do mesmo card em < 2s,
                  // preserva o currentTime pra não parecer jarrento.
                  v.play().catch(() => {});
                }}
                onMouseLeave={(e) => {
                  const v = e.currentTarget;
                  v.pause();
                  // NÃO resetar currentTime — deixa parado no frame atual.
                  // Se o user re-entrar, continua de onde parou (igual Netflix).
                }}
                onLoadedMetadata={(e) => {
                  // Força mostrar frame aos 0.5s (muitos criativos começam com
                  // frame preto)
                  const v = e.currentTarget;
                  if (!isNaN(v.duration) && v.duration > 0.5) {
                    v.currentTime = 0.5;
                  }
                }}
                onEnded={(e) => {
                  // Quando termina o vídeo, reseta pra poder re-preview
                  e.currentTarget.currentTime = 0.5;
                }}
              />
            )}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.5) 100%)",
              }}
              aria-hidden="true"
            />
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full grid place-items-center border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{
                background: "rgba(255,255,255,0.2)",
                backdropFilter: "blur(8px)",
                borderColor: "rgba(255,255,255,0.25)",
              }}
            >
              <Play size={12} fill="white" strokeWidth={0} className="ml-0.5" />
            </div>
          </>
        ) : creative.kind === "image" && assetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl}
            alt={creative.caption ?? `Criativo em imagem de ${creative.offer.title}`}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-text-3">
            {creative.kind === "video" ? <Video size={20} /> : <ImageIcon size={20} />}
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 text-[9px] font-medium text-white px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm uppercase tracking-wider">
          {creative.kind === "video" ? (
            <Video size={9} strokeWidth={2} />
          ) : (
            <ImageIcon size={9} strokeWidth={2} />
          )}
          {creative.kind}
        </span>
      </div>

      <div className="text-[11px] text-text-2 font-medium line-clamp-1">
        {creative.offer.title}
      </div>
      <div className="flex items-center gap-1 text-[9px] text-text-3">
        <span>{NICHE_EMOJI[creative.offer.niche]}</span>
        <span className="truncate">{NICHE_LABELS[creative.offer.niche]}</span>
        <span className="text-text-4">·</span>
        <span>{LANGUAGE_LABELS[creative.offer.language].flag}</span>
      </div>

      {/* Transcription action */}
      {creative.kind === "video" &&
        (hasTranscript ? (
          <button
            type="button"
            onClick={(e) => {
              // Parent é um <Link>, evita navegação
              e.preventDefault();
              e.stopPropagation();
              // Dispara download via location change (content-disposition attachment cuida)
              window.open(`/api/creatives/${creative.id}/transcript`, "_blank");
            }}
            className="
              inline-flex items-center justify-center gap-1
              text-[10px] font-medium text-[var(--success)]
              px-2 py-1 rounded bg-[color-mix(in_srgb,var(--success)_12%,transparent)]
              hover:bg-[color-mix(in_srgb,var(--success)_20%,transparent)]
              transition-colors
            "
            title="Baixar transcrição"
          >
            <Download size={10} strokeWidth={2} />
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
                // Poll job até done
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
              inline-flex items-center justify-center gap-1
              text-[10px] font-medium text-text-2 hover:text-text
              px-2 py-1 rounded bg-[var(--bg-elevated)] hover:bg-[var(--bg-glass)]
              transition-colors
              disabled:opacity-50
            "
            title="Gerar transcrição via Whisper"
          >
            {transcribing ? (
              <>
                <Loader2 size={10} className="animate-spin" />
                Transcrevendo...
              </>
            ) : (
              <>
                <FileText size={10} strokeWidth={1.8} />
                Transcrever
              </>
            )}
          </button>
        ))}
    </Link>
  );
}
