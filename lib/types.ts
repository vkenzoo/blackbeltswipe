// Tipos compartilhados — espelham a futura schema Postgres

/**
 * Nichos consolidados (v2). Histórico da migração:
 *   - marketing, ecommerce, financas foram absorvidos em `renda_extra` (são
 *     todos "ganhar dinheiro online" na prática do produto)
 *   - desenvolvimento virou `mentalidade` (reflete melhor o conteúdo real:
 *     produtividade, mindset, disciplina, hábitos)
 */
export type Niche =
  | "renda_extra"
  | "ia_tech"
  | "mentalidade"
  | "beleza"
  | "saude";

export type Language = "pt-BR" | "en-US" | "es-ES";

export type OfferStructure = "vsl" | "quiz" | "low_ticket" | "infoproduto";

export type TrafficSource = "facebook" | "google" | "tiktok" | "multi";

export type OfferStatus = "active" | "paused" | "draft";

export type PageType = "ad_library" | "fb_page" | "main_site" | "checkout";

export type CreativeKind = "video" | "image";

export type MetricWindow = "7d" | "30d" | "3m" | "6m";

/**
 * Sugestões da IA pra uma oferta. Fica em offers.ai_draft até admin aprovar.
 * Gerado por GPT-4o-mini com vision (transcript + screenshot da landing).
 */
export type AiDraft = {
  suggested_title?: string;
  structure?: OfferStructure;
  structure_confidence?: number; // 0-1
  structure_reason?: string;
  traffic_source?: TrafficSource;
  ai_summary?: string;
  estimated_price_tier?: "low" | "mid" | "high" | "unknown";
  tags?: string[];
  /** Tokens consumidos (pra tracking de custo) */
  tokens_used?: { prompt: number; completion: number };
  /** Modelo usado (pra auditoria se trocar) */
  model?: string;
};

export type Offer = {
  id: string;
  slug: string;
  title: string;
  niche: Niche;
  language: Language;
  structure: OfferStructure;
  traffic_source: TrafficSource;
  status: OfferStatus;
  ad_count: number;
  launched_at: string | null; // ISO date
  thumb_gradient: number; // 1-20, referência ao gradient CSS

  // VSL (null se ainda não foi upado)
  vsl_storage_path?: string | null;
  vsl_thumbnail_path?: string | null;
  vsl_duration_seconds?: number | null;
  vsl_size_bytes?: number | null;
  vsl_uploaded_at?: string | null;

  // Transcript (Whisper)
  transcript_preview?: string | null;
  transcript_text?: string | null;

  // AI
  ai_summary?: string | null;

  // AI-assisted authoring — sugestão do GPT-4o-mini aguardando revisão do admin.
  // Nunca é lida pelo app público — só o banner em /admin/offers/[id]/edit usa.
  ai_draft?: AiDraft | null;
  ai_generated_at?: string | null;
  ai_accepted_at?: string | null;
  ai_discarded_at?: string | null;
  ai_accepted_fields?: string[] | null;

  // Spy Engine — scale thermometer
  scale_score?: number | null;          // 0-100
  scale_trend?: "rising" | "steady" | "cooling" | "dead" | null;
  scale_velocity?: number | null;       // % change 7d
  last_refreshed_at?: string | null;
  refresh_interval_hours?: number | null;
  auto_paused_at?: string | null;
  consecutive_zero_days?: number | null;

  flags?: string[];
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

// Backwards-compat alias pra componentes que usavam transcript_duration
export type OfferWithDuration = Offer & {
  /** @deprecated usar vsl_duration_seconds */
  transcript_duration?: number | null;
};

export type Page = {
  id: string;
  offer_id: string;
  type: PageType;
  url: string;
  title?: string | null;
  screenshot_url?: string | null;
  fetched_at?: string | null;
  visible?: boolean;
  display_order?: number;
};

export type Creative = {
  id: string;
  offer_id: string;
  kind: CreativeKind;
  asset_url: string;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
  captured_at?: string;
  visible?: boolean;
  display_order?: number;
  caption?: string | null;
  published_at?: string | null;
  transcript_text?: string | null;
  transcript_preview?: string | null;
  transcribed_at?: string | null;

  // Meta Ad Library API fields
  meta_ad_id?: string | null;
  meta_snapshot_url?: string | null;
  platforms?: string[] | null;
  stopped_at?: string | null;
  ad_creative_title?: string | null;
  ad_creative_description?: string | null;
  languages?: string[] | null;
};

export type Metric = {
  date: string; // ISO
  ad_count: number;
};

export type OfferMetrics = {
  offer_id: string;
  window: MetricWindow;
  series: Metric[];
  delta_percent: number;
};

// Labels humanos pra render de pills

export const NICHE_LABELS: Record<Niche, string> = {
  renda_extra: "Renda Extra",
  ia_tech: "IA & Tech",
  mentalidade: "Mentalidade",
  beleza: "Beleza",
  saude: "Saúde",
};

export const NICHE_EMOJI: Record<Niche, string> = {
  renda_extra: "🌱",
  ia_tech: "🧠",
  mentalidade: "🧘",
  beleza: "💅",
  saude: "💚",
};

/**
 * Lookup defensivo: se vier um niche antigo do DB (antes da migration de
 * consolidação rodar), normaliza pro novo. Evita crash no render de
 * offers cujo niche ainda está com valor legacy.
 */
const LEGACY_NICHE_MAP: Record<string, Niche> = {
  marketing: "renda_extra",
  ecommerce: "renda_extra",
  financas: "renda_extra",
  desenvolvimento: "mentalidade",
};

export function normalizeNiche(raw: string | null | undefined): Niche | null {
  if (!raw) return null;
  if (raw in NICHE_LABELS) return raw as Niche;
  return LEGACY_NICHE_MAP[raw] ?? null;
}

export function nicheLabel(raw: string | null | undefined): string {
  const n = normalizeNiche(raw);
  return n ? NICHE_LABELS[n] : "—";
}

export function nicheEmoji(raw: string | null | undefined): string {
  const n = normalizeNiche(raw);
  return n ? NICHE_EMOJI[n] : "";
}

export const STRUCTURE_LABELS: Record<OfferStructure, string> = {
  vsl: "VSL",
  quiz: "Quiz",
  low_ticket: "Low Ticket",
  infoproduto: "Infoproduto",
};

export const LANGUAGE_LABELS: Record<Language, { flag: string; label: string }> = {
  "pt-BR": { flag: "🇧🇷", label: "Português (Brasil)" },
  "en-US": { flag: "🇺🇸", label: "English (US)" },
  "es-ES": { flag: "🇪🇸", label: "Español" },
};

export const TRAFFIC_LABELS: Record<TrafficSource, string> = {
  facebook: "Facebook",
  google: "Google",
  tiktok: "TikTok",
  multi: "Multi",
};

export const STATUS_LABELS: Record<OfferStatus, string> = {
  active: "Ativo",
  paused: "Pausada",
  draft: "Rascunho",
};
