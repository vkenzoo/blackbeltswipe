// Tipos compartilhados — espelham a futura schema Postgres

export type Niche =
  | "renda_extra"
  | "financas"
  | "ecommerce"
  | "ia_tech"
  | "marketing"
  | "desenvolvimento"
  | "beleza"
  | "saude";

export type Language = "pt-BR" | "en-US" | "es-ES";

export type OfferStructure = "vsl" | "quiz" | "low_ticket" | "infoproduto";

export type TrafficSource = "facebook" | "google" | "tiktok" | "multi";

export type OfferStatus = "active" | "paused" | "draft";

export type PageType = "ad_library" | "fb_page" | "main_site" | "checkout";

export type CreativeKind = "video" | "image";

export type MetricWindow = "7d" | "30d" | "3m" | "6m";

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
  launched_at: string; // ISO date
  vsl_url?: string;
  ai_summary?: string;
  flags?: string[];
  thumb_gradient: number; // 1-20, referência ao gradient CSS
  transcript_preview?: string; // primeiros 400 chars do transcrito
  transcript_duration?: number; // segundos
  created_at?: string;
  updated_at?: string;
};

export type Page = {
  id: string;
  offer_id: string;
  type: PageType;
  url: string;
  title?: string;
  screenshot_url?: string;
  fetched_at?: string;
};

export type Creative = {
  id: string;
  offer_id: string;
  kind: CreativeKind;
  asset_url: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  captured_at?: string;
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
  financas: "Finanças",
  ecommerce: "E-commerce",
  ia_tech: "IA & Tech",
  marketing: "Marketing",
  desenvolvimento: "Desenvolvimento",
  beleza: "Beleza",
  saude: "Saúde",
};

export const NICHE_EMOJI: Record<Niche, string> = {
  renda_extra: "🌱",
  financas: "💵",
  ecommerce: "📦",
  ia_tech: "🧠",
  marketing: "📣",
  desenvolvimento: "🪴",
  beleza: "💅",
  saude: "💚",
};

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
