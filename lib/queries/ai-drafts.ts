import { createServiceClient } from "@/lib/supabase/server";
import type { AiDraft } from "@/lib/types";

export type AiDraftRow = {
  id: string;
  slug: string;
  title: string;
  niche: string;
  structure: string;
  traffic_source: string;
  status: string;
  vsl_thumbnail_path: string | null;
  ai_draft: AiDraft | null;
  ai_generated_at: string | null;
  ai_accepted_at: string | null;
  ai_discarded_at: string | null;
  ai_accepted_fields: string[] | null;
};

export type AiDraftFilter = "pending" | "accepted" | "discarded" | "all";

export type AiSuggestStats = {
  total_drafts: number;
  pending: number;
  accepted: number;
  discarded: number;
  acceptance_rate: number; // 0-1
  total_tokens_prompt: number;
  total_tokens_completion: number;
  total_cost_usd: number;
  /** Contagem por campo — quantos aceitaram cada um */
  fields_accepted: Record<string, number>;
  /** Breakdown de structure sugerido */
  structures_suggested: Record<string, number>;
  last_generated_at: string | null;
};

/**
 * Lista ofertas com ai_draft, filtradas por status de revisão.
 */
export async function listAiDrafts(
  filter: AiDraftFilter = "pending",
  limit: number = 100
): Promise<AiDraftRow[]> {
  const supa = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supa as any)
    .from("offers")
    .select(
      "id, slug, title, niche, structure, traffic_source, status, vsl_thumbnail_path, ai_draft, ai_generated_at, ai_accepted_at, ai_discarded_at, ai_accepted_fields"
    )
    .not("ai_draft", "is", null)
    .order("ai_generated_at", { ascending: false })
    .limit(limit);

  if (filter === "pending") {
    q = q.is("ai_accepted_at", null).is("ai_discarded_at", null);
  } else if (filter === "accepted") {
    q = q.not("ai_accepted_at", "is", null);
  } else if (filter === "discarded") {
    q = q.not("ai_discarded_at", "is", null);
  }

  const { data } = await q;
  return ((data ?? []) as AiDraftRow[]) ?? [];
}

/**
 * Stats globais do sistema de AI Suggest.
 */
export async function getAiSuggestStats(): Promise<AiSuggestStats> {
  const supa = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allRaw } = await (supa as any)
    .from("offers")
    .select(
      "id, ai_draft, ai_generated_at, ai_accepted_at, ai_discarded_at, ai_accepted_fields"
    )
    .not("ai_draft", "is", null)
    .order("ai_generated_at", { ascending: false });

  const rows = (allRaw ?? []) as Array<{
    id: string;
    ai_draft: AiDraft | null;
    ai_generated_at: string | null;
    ai_accepted_at: string | null;
    ai_discarded_at: string | null;
    ai_accepted_fields: string[] | null;
  }>;

  let pending = 0;
  let accepted = 0;
  let discarded = 0;
  let totalPrompt = 0;
  let totalCompletion = 0;
  const fieldsAccepted: Record<string, number> = {};
  const structuresSuggested: Record<string, number> = {};
  let lastGenerated: string | null = null;

  for (const r of rows) {
    if (r.ai_accepted_at) accepted++;
    else if (r.ai_discarded_at) discarded++;
    else pending++;

    const tk = r.ai_draft?.tokens_used;
    if (tk) {
      totalPrompt += tk.prompt ?? 0;
      totalCompletion += tk.completion ?? 0;
    }

    for (const f of r.ai_accepted_fields ?? []) {
      fieldsAccepted[f] = (fieldsAccepted[f] ?? 0) + 1;
    }

    const s = r.ai_draft?.structure;
    if (s) structuresSuggested[s] = (structuresSuggested[s] ?? 0) + 1;

    if (r.ai_generated_at) {
      if (!lastGenerated || r.ai_generated_at > lastGenerated) {
        lastGenerated = r.ai_generated_at;
      }
    }
  }

  const reviewed = accepted + discarded;
  const acceptance_rate = reviewed > 0 ? accepted / reviewed : 0;

  // GPT-4o-mini pricing: $0.150 / 1M input, $0.600 / 1M output
  const total_cost_usd =
    (totalPrompt / 1_000_000) * 0.15 +
    (totalCompletion / 1_000_000) * 0.6;

  return {
    total_drafts: rows.length,
    pending,
    accepted,
    discarded,
    acceptance_rate,
    total_tokens_prompt: totalPrompt,
    total_tokens_completion: totalCompletion,
    total_cost_usd,
    fields_accepted: fieldsAccepted,
    structures_suggested: structuresSuggested,
    last_generated_at: lastGenerated,
  };
}

/** Conta só pendentes (pra badge do sidebar). */
export async function countPendingAiDrafts(): Promise<number> {
  const supa = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supa as any)
    .from("offers")
    .select("id", { count: "exact", head: true })
    .not("ai_draft", "is", null)
    .is("ai_accepted_at", null)
    .is("ai_discarded_at", null);

  return count ?? 0;
}
