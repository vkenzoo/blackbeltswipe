import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { transcribeFromStorage } from "@/lib/worker/transcribe";

type Supa = SupabaseClient<Database>;

/**
 * Handler: transcribe_vsl
 * Re-transcreve a VSL atual da oferta via Whisper.
 * Payload: { offer_id }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleTranscribeVsl(supa: Supa, payload: any): Promise<void> {
  const { offer_id } = payload as { offer_id: string };
  if (!offer_id) throw new Error("missing offer_id");

  const { data: offer } = await supa
    .from("offers")
    .select("vsl_storage_path")
    .eq("id", offer_id)
    .maybeSingle<{ vsl_storage_path: string | null }>();
  if (!offer?.vsl_storage_path) throw new Error("no_vsl");

  const tr = await transcribeFromStorage(supa, offer.vsl_storage_path);
  if (!tr.ok || !tr.text) throw new Error(tr.error ?? "transcribe_failed");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa.from("offers") as any)
    .update({
      transcript_text: tr.text,
      transcript_preview: tr.preview,
      vsl_duration_seconds: tr.duration,
    })
    .eq("id", offer_id);

  // Transcript atualizado → cria request de ai_authoring (admin aprova em
  // /admin/aprovacoes). NÃO enfileira job direto.
  try {
    const { requestAiAction, COST_ESTIMATES } = await import(
      "@/lib/worker/request-ai-action"
    );
    await requestAiAction({
      supa,
      actionType: "ai_authoring",
      offerId: offer_id,
      payload: { offer_id },
      costEstimateUsd: COST_ESTIMATES.ai_authoring,
      context: { source: "transcribe_vsl_handler_followup" },
    });
  } catch {
    /* silent — não bloqueia fluxo de transcribe */
  }
}
