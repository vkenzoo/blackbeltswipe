/**
 * sync-creatives-from-api — baixa mídia real (video OU imagem) dos ads.
 *
 * Limites por oferta:
 *   - 20 vídeos (mp4 baixado + thumb gerada via ffmpeg)
 *   - 10 imagens (jpg baixado, serve como própria thumb)
 *
 * Fluxo:
 *   1. API Meta dá lista de ads + metadata (copy, platforms, dates) + ad_snapshot_url
 *   2. Pra cada ad_snapshot_url, Playwright abre a render page do Meta
 *   3. Intercepta responses + DOM pra achar video URL ou image URL
 *   4. Download → upload Storage 'creatives' → insert creative com metadata
 *
 * Fetcha até 80 ads da API pra ter margem.
 * Idempotente via meta_ad_id unique — re-runs não duplicam.
 * NUNCA insere creative sem asset_url preenchido (garantia de preview funcionar).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Browser } from "playwright";
import {
  fetchActiveAdsByPage,
  isApiEnabled,
  type AdLibraryAd,
} from "./ad-library-api";

type Supa = SupabaseClient<Database>;

const MAX_VIDEOS_PER_OFFER = 20;
const MAX_IMAGES_PER_OFFER = 10;
const MAX_ADS_FROM_API = 80; // margem ampla (precisamos achar 30 mídias de qualquer tipo)

export type SyncResult = {
  skipped: boolean;
  skip_reason?: string;
  api_total: number;
  videos_downloaded: number;
  images_downloaded: number;
  media_skipped: number;
  download_failed: number;
  stopped: number;
  new_ad_ids: string[];
  errors: string[];
};

export async function syncCreativesFromApi(
  supa: Supa,
  offerId: string,
  options?: {
    countries?: string[];
    dispatchAlerts?: boolean;
    browser?: Browser;
    offerSlug?: string;
  }
): Promise<SyncResult> {
  const countries = options?.countries ?? ["BR"];
  const dispatchAlerts = options?.dispatchAlerts ?? true;
  const browser = options?.browser;

  if (!isApiEnabled()) {
    return emptyResult({ skipped: true, skip_reason: "api_disabled" });
  }
  if (!browser) {
    return emptyResult({
      skipped: true,
      skip_reason: "no_browser_for_video_extraction",
    });
  }

  // Busca slug se não fornecido
  let offerSlug = options?.offerSlug;
  if (!offerSlug) {
    const { data } = await supa
      .from("offers")
      .select("slug")
      .eq("id", offerId)
      .maybeSingle<{ slug: string }>();
    if (!data) return emptyResult({ skipped: true, skip_reason: "offer_not_found" });
    offerSlug = data.slug;
  }

  // 1. Busca ad_library pages da oferta — APENAS verified_for_sync=true.
  // Pages descobertas via domain discovery automático entram como
  // verified_for_sync=false e só alimentam sync depois que admin aprovar.
  // Isso previne contaminação quando um page_id de outro advertiser
  // entra erroneamente na oferta.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: adLibPages } = await (supa as any)
    .from("pages")
    .select("meta_page_id, verified_for_sync")
    .eq("offer_id", offerId)
    .eq("type", "ad_library")
    .eq("verified_for_sync", true)
    .not("meta_page_id", "is", null)
    .returns<{ meta_page_id: string; verified_for_sync: boolean }[]>();

  if (!adLibPages || adLibPages.length === 0) {
    return emptyResult({
      skipped: true,
      skip_reason: "no_verified_ad_library_pages",
    });
  }

  // 2. Fetch ads via API (cap MAX_ADS_FROM_API por page pra ter margem)
  const apiAds: AdLibraryAd[] = [];
  const errors: string[] = [];
  for (const p of adLibPages) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetchActiveAdsByPage(
      p.meta_page_id,
      countries,
      undefined,
      MAX_ADS_FROM_API,
      { caller_handler: "sync_creatives", offer_id: offerId }
    );
    if (res.blocked || res.count === null) {
      errors.push(`page=${p.meta_page_id}:${res.error ?? "blocked"}`);
      continue;
    }
    apiAds.push(...res.ads);
  }

  if (apiAds.length === 0) {
    return emptyResult({ errors });
  }

  // 3. Dedup contra creatives existentes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supa as any)
    .from("creatives")
    .select("id, meta_ad_id, stopped_at")
    .eq("offer_id", offerId)
    .returns<{ id: string; meta_ad_id: string | null; stopped_at: string | null }[]>();

  const existingByAdId = new Map<string, { id: string; stopped_at: string | null }>();
  for (const c of existing ?? []) {
    if (c.meta_ad_id) existingByAdId.set(c.meta_ad_id, { id: c.id, stopped_at: c.stopped_at });
  }

  // 4. Descobre stopped (ads no DB sem stop, ausentes no ACTIVE response)
  const apiAdIds = new Set(apiAds.map((a) => a.id));
  const stoppedIds = [...existingByAdId.entries()]
    .filter(([adId, c]) => !apiAdIds.has(adId) && !c.stopped_at)
    .map(([, c]) => c.id);

  // 5. Ads novos (não cadastrados ainda)
  const newAds = apiAds.filter((ad) => !existingByAdId.has(ad.id));

  // 6. Próximo display_order
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: maxOrder } = await (supa as any)
    .from("creatives")
    .select("display_order")
    .eq("offer_id", offerId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = (maxOrder?.display_order ?? -1) + 1;

  // 7. Loop: extrai mídia (video OU imagem) via Playwright
  let videosDownloaded = 0;
  let imagesDownloaded = 0;
  let mediaSkipped = 0;
  let downloadFailed = 0;
  const newAdIds: string[] = [];

  for (const ad of newAds) {
    const hitVideoCap = videosDownloaded >= MAX_VIDEOS_PER_OFFER;
    const hitImageCap = imagesDownloaded >= MAX_IMAGES_PER_OFFER;
    if (hitVideoCap && hitImageCap) break;

    if (!ad.ad_snapshot_url) {
      mediaSkipped++;
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const media = await extractMediaFromSnapshot(ad.ad_snapshot_url, browser);

      if (!media) {
        mediaSkipped++;
        continue;
      }

      // Decide qual downloadar baseado em caps restantes
      let result:
        | { ok: true; kind: "video" | "image"; creativeId: string }
        | { ok: false; error: string };

      if (media.videoUrl && !hitVideoCap) {
        // eslint-disable-next-line no-await-in-loop
        result = await downloadAndInsertVideo({
          supa,
          offerId,
          offerSlug,
          ad,
          videoUrl: media.videoUrl,
          displayOrder: nextOrder++,
        });
      } else if (media.imageUrl && !hitImageCap) {
        // eslint-disable-next-line no-await-in-loop
        result = await downloadAndInsertImage({
          supa,
          offerId,
          offerSlug,
          ad,
          imageUrl: media.imageUrl,
          displayOrder: nextOrder++,
        });
      } else {
        // Cap atingido pra esse tipo, pula
        mediaSkipped++;
        continue;
      }

      if (result.ok) {
        if (result.kind === "video") videosDownloaded++;
        else imagesDownloaded++;
        newAdIds.push(ad.id);
      } else {
        downloadFailed++;
        errors.push(`ad=${ad.id}:${result.error}`);
      }
    } catch (err) {
      downloadFailed++;
      errors.push(`ad=${ad.id}:${err instanceof Error ? err.message : err}`);
    }
  }

  // 8. Marca stopped em criativos que sumiram do ACTIVE
  let stopped = 0;
  if (stoppedIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (supa.from("creatives") as any)
      .update({ stopped_at: new Date().toISOString() })
      .in("id", stoppedIds);
    if (!updErr) stopped = stoppedIds.length;
  }

  // 9. Dispatch alerts pros subscribers
  if (dispatchAlerts && newAdIds.length > 0) {
    await dispatchNewCreativeAlerts(supa, offerId, newAdIds);
  }

  return {
    skipped: false,
    api_total: apiAds.length,
    videos_downloaded: videosDownloaded,
    images_downloaded: imagesDownloaded,
    media_skipped: mediaSkipped,
    download_failed: downloadFailed,
    stopped,
    new_ad_ids: newAdIds,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────
// Media extraction do ad_snapshot_url via Playwright
// ─────────────────────────────────────────────────────────────

type ExtractedMedia = {
  videoUrl?: string;
  imageUrl?: string;
};

async function extractMediaFromSnapshot(
  snapshotUrl: string,
  browser: Browser
): Promise<ExtractedMedia | null> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "pt-BR",
    serviceWorkers: "block",
  });

  const videoUrls: string[] = [];
  const imageUrls: string[] = [];

  try {
    const page = await context.newPage();

    // Intercepta responses
    page.on("response", (res) => {
      const url = res.url();
      const ct = res.headers()["content-type"] ?? "";
      // Videos: content-type video/* ou extensão .mp4
      if (
        (ct.startsWith("video/") || /\.mp4(\?|$)/i.test(url)) &&
        !url.startsWith("blob:")
      ) {
        videoUrls.push(url);
      }
      // Imagens grandes do ad (fbcdn/scontent, mínimo 300px width pra evitar avatares/UI)
      if (
        ct.startsWith("image/") &&
        (url.includes("fbcdn") || url.includes("scontent")) &&
        !url.includes("rsrc.php") &&
        !url.includes("emoji")
      ) {
        imageUrls.push(url);
      }
    });

    await page.goto(snapshotUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    // Aguarda assets carregarem
    await page.waitForTimeout(3000);

    // DOM parsing: <video> e <img>
    const domMedia = await page.evaluate(() => {
      const out = { videoSrc: null as string | null, images: [] as string[] };
      const v = document.querySelector("video");
      if (v) {
        const src =
          v.getAttribute("src") ||
          v.querySelector("source")?.getAttribute("src") ||
          null;
        if (src) out.videoSrc = src;
      }
      // Imagens com tamanho razoável (ad creative vs avatar/UI)
      document.querySelectorAll("img").forEach((img) => {
        const src = img.src;
        if (!src || !src.startsWith("http")) return;
        if (img.naturalWidth < 300 || img.naturalHeight < 300) return;
        if (src.includes("rsrc.php") || src.includes("emoji")) return;
        out.images.push(src);
      });
      return out;
    });
    if (domMedia.videoSrc && !domMedia.videoSrc.startsWith("blob:")) {
      videoUrls.push(domMedia.videoSrc);
    }
    imageUrls.push(...domMedia.images);

    // Prioriza vídeo (mais valioso). Se não tem video, retorna imagem maior.
    const videoUrl =
      videoUrls.find((u) => /\.mp4(\?|$)/i.test(u)) ?? videoUrls[0];

    if (videoUrl) {
      return { videoUrl };
    }

    // Dedup imagens + pega a primeira válida
    const uniqImgs = [...new Set(imageUrls)];
    if (uniqImgs.length > 0) {
      return { imageUrl: uniqImgs[0] };
    }

    return null;
  } catch {
    return null;
  } finally {
    await context.close().catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────
// Download + upload + thumb + insert (reusa padrão do enrich.ts)
// ─────────────────────────────────────────────────────────────

async function downloadAndInsertVideo(params: {
  supa: Supa;
  offerId: string;
  offerSlug: string;
  ad: AdLibraryAd;
  videoUrl: string;
  displayOrder: number;
}): Promise<
  { ok: true; kind: "video"; creativeId: string } | { ok: false; error: string }
> {
  const { supa, offerId, offerSlug, ad, videoUrl, displayOrder } = params;

  // Download mp4
  let buffer: Buffer;
  try {
    const res = await fetch(videoUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return { ok: false, error: `fetch_${res.status}` };
    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
    if (buffer.length < 1000) return { ok: false, error: "video_too_small" };
  } catch (err) {
    return {
      ok: false,
      error: `download_err:${err instanceof Error ? err.message : err}`,
    };
  }

  const ts = Date.now();
  const assetPath = `${offerSlug}/${ts}_${ad.id}.mp4`;

  // Upload mp4
  const { error: upErr } = await supa.storage
    .from("creatives")
    .upload(assetPath, buffer, {
      contentType: "video/mp4",
      upsert: true,
    });
  if (upErr) return { ok: false, error: `upload_err:${upErr.message}` };

  // Gera thumb via ffmpeg (frame @ 0.5s)
  let thumbPath: string | null = null;
  try {
    const { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } =
      await import("fs");
    const { join } = await import("path");
    const { execFileSync } = await import("child_process");
    const tmpDir = "/tmp/bbs-ad-thumb";
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const tmpMp4 = join(tmpDir, `${ts}_${ad.id}.mp4`);
    const tmpJpg = join(tmpDir, `${ts}_${ad.id}.jpg`);
    writeFileSync(tmpMp4, buffer);
    try {
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-ss",
          "0.5",
          "-i",
          tmpMp4,
          "-vframes",
          "1",
          "-q:v",
          "3",
          tmpJpg,
        ],
        { stdio: "pipe" }
      );
      const thumbBuf = readFileSync(tmpJpg);
      thumbPath = `${offerSlug}/${ts}_${ad.id}_thumb.jpg`;
      await supa.storage.from("creatives").upload(thumbPath, thumbBuf, {
        contentType: "image/jpeg",
        upsert: true,
      });
    } finally {
      rmSync(tmpMp4, { force: true });
      rmSync(tmpJpg, { force: true });
    }
  } catch (err) {
    console.warn(
      `[sync_creatives] thumb gen falhou pra ad ${ad.id}:`,
      err instanceof Error ? err.message : err
    );
  }

  // Insert creative
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insErr } = await (supa.from("creatives") as any)
    .insert({
      offer_id: offerId,
      kind: "video",
      asset_url: assetPath,
      thumbnail_url: thumbPath,
      caption: ad.ad_creative_bodies?.[0]?.slice(0, 2000) ?? null,
      ad_creative_title: ad.ad_creative_link_titles?.[0]?.slice(0, 500) ?? null,
      ad_creative_description:
        ad.ad_creative_link_descriptions?.[0]?.slice(0, 1000) ?? null,
      published_at: ad.ad_delivery_start_time ?? ad.ad_creation_time ?? null,
      captured_at: new Date().toISOString(),
      visible: true,
      display_order: displayOrder,
      meta_ad_id: ad.id,
      meta_snapshot_url: ad.ad_snapshot_url ?? null,
      platforms: ad.publisher_platforms ?? null,
      languages: ad.languages ?? null,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    // Limpa storage se DB falhou
    await supa.storage
      .from("creatives")
      .remove([assetPath, thumbPath].filter(Boolean) as string[])
      .catch(() => {});
    return {
      ok: false,
      error: `insert_err:${insErr?.message ?? "unknown"}`,
    };
  }

  // Auto-enqueue transcribe_creative pro novo video
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa.from("jobs") as any).insert({
    kind: "transcribe_creative",
    payload: { creative_id: inserted.id },
    status: "pending",
  });

  return { ok: true, kind: "video", creativeId: inserted.id };
}

// ─────────────────────────────────────────────────────────────
// downloadAndInsertImage — baixa jpg, sobe bucket, insert creative
// ─────────────────────────────────────────────────────────────

async function downloadAndInsertImage(params: {
  supa: Supa;
  offerId: string;
  offerSlug: string;
  ad: AdLibraryAd;
  imageUrl: string;
  displayOrder: number;
}): Promise<
  { ok: true; kind: "image"; creativeId: string } | { ok: false; error: string }
> {
  const { supa, offerId, offerSlug, ad, imageUrl, displayOrder } = params;

  let buffer: Buffer;
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return { ok: false, error: `fetch_${res.status}` };
    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
    if (buffer.length < 500) return { ok: false, error: "image_too_small" };
  } catch (err) {
    return {
      ok: false,
      error: `download_err:${err instanceof Error ? err.message : err}`,
    };
  }

  const ts = Date.now();
  // Detecta extensão baseado em content-type ou URL (jpg default)
  const ext =
    imageUrl.toLowerCase().endsWith(".png") ||
    buffer.slice(0, 8).toString("hex").startsWith("89504e47")
      ? "png"
      : "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  const assetPath = `${offerSlug}/${ts}_${ad.id}.${ext}`;

  const { error: upErr } = await supa.storage
    .from("creatives")
    .upload(assetPath, buffer, { contentType, upsert: true });
  if (upErr) return { ok: false, error: `upload_err:${upErr.message}` };

  // Pra imagem, thumb = o próprio asset (não gera separado)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insErr } = await (supa.from("creatives") as any)
    .insert({
      offer_id: offerId,
      kind: "image",
      asset_url: assetPath,
      thumbnail_url: assetPath, // próprio asset serve de preview
      caption: ad.ad_creative_bodies?.[0]?.slice(0, 2000) ?? null,
      ad_creative_title: ad.ad_creative_link_titles?.[0]?.slice(0, 500) ?? null,
      ad_creative_description:
        ad.ad_creative_link_descriptions?.[0]?.slice(0, 1000) ?? null,
      published_at: ad.ad_delivery_start_time ?? ad.ad_creation_time ?? null,
      captured_at: new Date().toISOString(),
      visible: true,
      display_order: displayOrder,
      meta_ad_id: ad.id,
      meta_snapshot_url: ad.ad_snapshot_url ?? null,
      platforms: ad.publisher_platforms ?? null,
      languages: ad.languages ?? null,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    await supa.storage.from("creatives").remove([assetPath]).catch(() => {});
    return { ok: false, error: `insert_err:${insErr?.message ?? "unknown"}` };
  }

  return { ok: true, kind: "image", creativeId: inserted.id };
}

// ─────────────────────────────────────────────────────────────
// Dispatch alerts
// ─────────────────────────────────────────────────────────────

async function dispatchNewCreativeAlerts(
  supa: Supa,
  offer_id: string,
  newAdIds: string[]
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: subs } = await (supa as any)
      .from("alert_subscriptions")
      .select("id, user_id, alert_on")
      .eq("offer_id", offer_id)
      .returns<{ id: string; user_id: string; alert_on: string[] }[]>();

    if (!subs?.length) return;

    const rows = subs
      .filter((s: { alert_on: string[] }) =>
        (s.alert_on ?? []).includes("new_creative")
      )
      .map((s: { id: string; user_id: string }) => ({
        subscription_id: s.id,
        user_id: s.user_id,
        offer_id,
        kind: "new_creative",
        payload: { new_ad_ids: newAdIds, count: newAdIds.length },
        delivered_via: "in_app",
      }));

    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa as any).from("alerts_log").insert(rows);
    }
  } catch (err) {
    console.warn(
      "[sync_creatives] alerts dispatch error:",
      err instanceof Error ? err.message : err
    );
  }
}

function emptyResult(partial: Partial<SyncResult>): SyncResult {
  return {
    skipped: false,
    api_total: 0,
    videos_downloaded: 0,
    images_downloaded: 0,
    media_skipped: 0,
    download_failed: 0,
    stopped: 0,
    new_ad_ids: [],
    errors: [],
    ...partial,
  };
}
