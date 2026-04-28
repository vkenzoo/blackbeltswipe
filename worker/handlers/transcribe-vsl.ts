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

  // Transcript atualizado → re-enfileira ai_authoring pra GPT revisar com
  // texto fresco. Admin vai ver banner com sugestões novas.
  // SÓ se feature estiver enabled na config.
  try {
    const { getAiSuggestConfigResolved } = await import("@/lib/queries/ai-suggest-config");
    const config = await getAiSuggestConfigResolved();
    if (config.enabled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa.from("jobs") as any).insert({
        kind: "ai_authoring",
        payload: { offer_id },
        status: "pending",
        priority: 60,
      });
    }
  } catch {
    /* silent — não bloqueia fluxo de transcribe */
  }
}
