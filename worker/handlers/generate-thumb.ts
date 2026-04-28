import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { extractThumbFromLocal } from "@/lib/worker/enrich";
import { writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

type Supa = SupabaseClient<Database>;

/**
 * Handler: generate_thumb
 * Gera thumb a partir da VSL atual OU de um creative específico.
 * Payload: { offer_id, source: "vsl" | "creative", creative_id? }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleGenerateThumb(supa: Supa, payload: any): Promise<void> {
  const { offer_id, source, creative_id } = payload as {
    offer_id: string;
    source: "vsl" | "creative";
    creative_id?: string;
  };
  if (!offer_id || !source) throw new Error("missing offer_id or source");

  const { data: offer } = await supa
    .from("offers")
    .select("slug, vsl_storage_path, vsl_thumbnail_path")
    .eq("id", offer_id)
    .maybeSingle<{
      slug: string;
      vsl_storage_path: string | null;
      vsl_thumbnail_path: string | null;
    }>();
  if (!offer) throw new Error("offer_not_found");

  let bucket: "vsls" | "creatives";
  let storagePath: string;
  if (source === "vsl") {
    if (!offer.vsl_storage_path) throw new Error("no_vsl_uploaded");
    bucket = "vsls";
    storagePath = offer.vsl_storage_path;
  } else {
    if (!creative_id) throw new Error("missing creative_id");
    const { data: c } = await supa
      .from("creatives")
      .select("asset_url, kind")
      .eq("id", creative_id)
      .maybeSingle<{ asset_url: string; kind: string }>();
    if (!c) throw new Error("creative_not_found");
    if (c.kind !== "video") throw new Error("creative_not_video");
    bucket = "creatives";
    storagePath = c.asset_url;
  }

  const tmpDir = "/tmp/bbs-worker-thumb";
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  const tmpMp4 = join(tmpDir, `${offer.slug}_${Date.now()}.mp4`);

  try {
    const { data: signed, error: sErr } = await supa.storage
      .from(bucket)
      .createSignedUrl(storagePath, 300);
    if (sErr || !signed) throw new Error(sErr?.message ?? "sign_failed");

    const res = await fetch(signed.signedUrl);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const ab = await res.arrayBuffer();
    writeFileSync(tmpMp4, new Uint8Array(ab));

    const thumbBuffer = extractThumbFromLocal(tmpMp4);
    // Path com timestamp — evita cache stale no browser/CDN quando admin
    // re-gera thumb da mesma oferta (cacheControl é 1h, mas URL muda = sem cache).
    const thumbPath = `${offer.slug}-${Date.now()}.jpg`;
    const { error: upErr } = await supa.storage
      .from("thumbs")
      .upload(thumbPath, thumbBuffer, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: false, // path único, não colide
      });
    if (upErr) throw new Error(upErr.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("offers") as any)
      .update({ vsl_thumbnail_path: thumbPath })
      .eq("id", offer_id);

    // Cleanup da thumb antiga (best-effort)
    if (offer.vsl_thumbnail_path && offer.vsl_thumbnail_path !== thumbPath) {
      try {
        await supa.storage.from("thumbs").remove([offer.vsl_thumbnail_path]);
      } catch {
        /* silent */
      }
    }
  } finally {
    try { rmSync(tmpMp4, { force: true }); } catch {}
  }
}
