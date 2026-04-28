import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { transcribeFromStorage } from "@/lib/worker/transcribe";

type Supa = SupabaseClient<Database>;

/**
 * Handler: transcribe_creative
 * Transcreve um criativo (video do bucket creatives/) via Whisper.
 * Payload: { creative_id }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleTranscribeCreative(supa: Supa, payload: any): Promise<void> {
  const { creative_id } = payload as { creative_id: string };
  if (!creative_id) throw new Error("missing creative_id");

  const { data: c } = await supa
    .from("creatives")
    .select("asset_url, kind, duration_seconds")
    .eq("id", creative_id)
    .maybeSingle<{ asset_url: string; kind: string; duration_seconds: number | null }>();
  if (!c) throw new Error("creative_not_found");
  if (c.kind !== "video") throw new Error("creative_not_video");

  const tr = await transcribeFromStorage(supa, c.asset_url, "creatives");
  if (!tr.ok || !tr.text) throw new Error(tr.error ?? "transcribe_failed");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa.from("creatives") as any)
    .update({
      transcript_text: tr.text,
      transcript_preview: tr.preview,
      transcribed_at: new Date().toISOString(),
      ...(c.duration_seconds ? {} : { duration_seconds: tr.duration }),
    })
    .eq("id", creative_id);
}
