import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { generateAuthoring } from "@/lib/worker/ai-authoring";

type Supa = SupabaseClient<Database>;

/**
 * Handler: ai_authoring
 *
 * Payload: { offer_id: string }
 *
 * Fluxo:
 *   1. Chama generateAuthoring() (GPT-4o-mini vision)
 *   2. Salva resposta em offers.ai_draft + ai_generated_at
 *   3. LIMPA ai_accepted_at e ai_discarded_at (caso seja re-geração)
 *
 * Nunca toca em title/structure/traffic_source/ai_summary diretamente.
 * Esses só mudam depois que admin aprova via /api/admin/offers/[id]/ai-authoring/accept.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleAiAuthoring(supa: Supa, payload: any): Promise<void> {
  const { offer_id } = payload as { offer_id: string };
  if (!offer_id) throw new Error("missing_offer_id");

  const result = await generateAuthoring(supa, offer_id);

  if (!result.ok) {
    throw new Error(result.error);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supa as any)
    .from("offers")
    .update({
      ai_draft: result.draft,
      ai_generated_at: new Date().toISOString(),
      ai_accepted_at: null, // reseta — nova sugestão merece nova revisão
      ai_discarded_at: null,
    })
    .eq("id", offer_id);

  if (error) throw new Error(`db_update_failed: ${error.message}`);

  const fields = Object.keys(result.draft).filter(
    (k) => k !== "tokens_used" && k !== "model"
  );
  const tokens = result.draft.tokens_used;
  console.log(
    `[ai_authoring] offer ${offer_id.slice(0, 8)} · ${fields.length} campos sugeridos · ${
      tokens ? `${tokens.prompt}+${tokens.completion} tokens` : "sem tracking"
    }`
  );
}
