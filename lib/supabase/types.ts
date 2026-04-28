/**
 * Types do Supabase.
 *
 * Depois que as migrations rodarem em prod, regenerar com:
 *   bunx supabase gen types typescript --project-id XYZ > lib/supabase/types.ts
 *
 * Até lá, este arquivo reflete o schema do migration 20260418000001.
 */

import type {
  Niche,
  Language,
  OfferStructure,
  TrafficSource,
  OfferStatus,
  PageType,
  CreativeKind,
  MetricWindow,
} from "../types";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
          role: "admin" | "member" | "affiliate";
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          role?: "admin" | "member" | "affiliate";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      offers: {
        Row: {
          id: string;
          slug: string;
          title: string;
          niche: Niche;
          language: Language;
          structure: OfferStructure;
          traffic_source: TrafficSource;
          status: OfferStatus;
          ad_count: number;
          launched_at: string | null;
          thumb_gradient: number;
          vsl_storage_path: string | null;
          vsl_thumbnail_path: string | null;
          vsl_duration_seconds: number | null;
          vsl_size_bytes: number | null;
          vsl_uploaded_at: string | null;
          transcript_text: string | null;
          transcript_preview: string | null;
          ai_summary: string | null;
          flags: string[];
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["offers"]["Row"],
          "id" | "created_at" | "updated_at"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["offers"]["Row"]>;
      };
      pages: {
        Row: {
          id: string;
          offer_id: string;
          type: PageType;
          url: string;
          title: string | null;
          screenshot_url: string | null;
          fetched_at: string | null;
          visible: boolean;
          display_order: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["pages"]["Row"], "id" | "created_at" | "visible" | "display_order"> & {
          id?: string;
          created_at?: string;
          visible?: boolean;
          display_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["pages"]["Row"]>;
      };
      creatives: {
        Row: {
          id: string;
          offer_id: string;
          kind: CreativeKind;
          asset_url: string;
          thumbnail_url: string | null;
          duration_seconds: number | null;
          captured_at: string;
          visible: boolean;
          display_order: number;
          caption: string | null;
          published_at: string | null;
          transcript_text: string | null;
          transcript_preview: string | null;
          transcribed_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["creatives"]["Row"], "id" | "captured_at" | "visible" | "display_order"> & {
          id?: string;
          captured_at?: string;
          visible?: boolean;
          display_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["creatives"]["Row"]>;
      };
      offer_metrics: {
        Row: {
          id: string;
          offer_id: string;
          time_window: MetricWindow;
          ad_count: number;
          spend_estimate: number | null;
          sampled_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["offer_metrics"]["Row"],
          "id" | "sampled_at"
        > & {
          id?: string;
          sampled_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["offer_metrics"]["Row"]>;
      };
      favorites: {
        Row: {
          user_id: string;
          offer_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          offer_id: string;
          created_at?: string;
        };
        Update: never;
      };
      jobs: {
        Row: {
          id: string;
          kind: string;
          payload: Json;
          status: "pending" | "running" | "done" | "error";
          error: string | null;
          attempts: number;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["jobs"]["Row"],
          "id" | "created_at" | "attempts"
        > & {
          id?: string;
          created_at?: string;
          attempts?: number;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
