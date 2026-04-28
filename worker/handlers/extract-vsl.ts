import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  autoScroll,
  playVideoIfPaused,
  findVslUrl,
  downloadVideo,
  revealHiddenContent,
} from "@/lib/worker/enrich";
import { transcribeFromStorage } from "@/lib/worker/transcribe";
import { getBrowser } from "../shared-browser";

type Supa = SupabaseClient<Database>;

/**
 * Handler: extract_vsl
 * Abre landing URL, extrai VSL (mp4/HLS), baixa, thumb, opcional transcribe.
 * Payload: { offer_id, landing_url, transcribe? }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleExtractVsl(supa: Supa, payload: any): Promise<void> {
  const { offer_id, landing_url, transcribe } = payload as {
    offer_id: string;
    landing_url: string;
    transcribe?: boolean;
  };
  if (!offer_id || !landing_url) throw new Error("missing offer_id or landing_url");

  const { data: offer } = await supa
    .from("offers")
    .select("slug")
    .eq("id", offer_id)
    .maybeSingle<{ slug: string }>();
  if (!offer) throw new Error("offer_not_found");

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });

  try {
    const page = await context.newPage();
    const mp4s: string[] = [];
    const hls: string[] = [];
    page.on("response", (r) => {
      try {
        const u = r.url();
        const ct = r.headers()["content-type"] || "";
        if (u.match(/\.m3u8(\?|$)/i) || ct.includes("mpegurl")) {
          if (!hls.includes(u)) hls.push(u);
        }
        if (u.match(/\.mp4(\?|$)/i) || ct.startsWith("video/mp4")) {
          if (!mp4s.includes(u)) mp4s.push(u);
        }
      } catch {}
    });

    await page.goto(landing_url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 8_000 });
    } catch {}
    await revealHiddenContent(page);
    await autoScroll(page, 2);
    await playVideoIfPaused(page);
    await page.waitForTimeout(3000);

    const vsl = await findVslUrl(page, mp4s, hls);
    if (!vsl) throw new Error("vsl_not_found");

    const r = await downloadVideo(vsl.url, vsl.kind);
    const vslPath = `${offer.slug}.mp4`;
    const { error: vErr } = await supa.storage
      .from("vsls")
      .upload(vslPath, r.buffer, {
        contentType: "video/mp4",
        cacheControl: "3600",
        upsert: true,
      });
    if (vErr) throw new Error(vErr.message);

    let thumbPath: string | null = null;
    if (r.thumbBuffer) {
      thumbPath = `${offer.slug}.jpg`;
      await supa.storage.from("thumbs").upload(thumbPath, r.thumbBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("offers") as any)
      .update({
        vsl_storage_path: vslPath,
        vsl_size_bytes: r.sizeBytes,
        vsl_uploaded_at: new Date().toISOString(),
        ...(thumbPath ? { vsl_thumbnail_path: thumbPath } : {}),
      })
      .eq("id", offer_id);

    if (transcribe) {
      const tr = await transcribeFromStorage(supa, vslPath);
      if (tr.ok && tr.text) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supa.from("offers") as any)
          .update({
            transcript_text: tr.text,
            transcript_preview: tr.preview,
            vsl_duration_seconds: tr.duration,
          })
          .eq("id", offer_id);

        // Transcript criado — enfileira ai_authoring se feature enabled.
        // Mesma lógica do handler transcribe-vsl standalone; evita oferta
        // ficar sem AI draft quando extract+transcribe rolam inline.
        try {
          const { getAiSuggestConfigResolved } = await import(
            "@/lib/queries/ai-suggest-config"
          );
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
          /* silent */
        }
      }
    }
  } finally {
    try { await context.close(); } catch {}
    // NÃO fecha browser — é global
  }
}
