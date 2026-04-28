/**
 * Enrichment worker: roda Playwright pra extrair screenshot + metadata
 * de uma URL (Ad Library, FB page, landing).
 *
 * Executa dentro do Next.js server process. Em produção (Vercel), precisa
 * ser movido pra worker dedicado (Coolify Docker).
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isCheckoutUrl } from "@/lib/security";

type EnrichResult = {
  ok: boolean;
  screenshotPath?: string;
  pageType: "ad_library" | "fb_page" | "main_site" | "checkout";
  pageTitle?: string | null;
  adCount?: number | null;
  creativesCreated: number;
  landingPagesCreated?: number;
  checkoutPagesCreated?: number;
  vslStoragePath?: string | null;
  vslSizeBytes?: number | null;
  vslThumbnailPath?: string | null;
  landingBodyText?: string | null;
  adBodyTexts?: string[];
  error?: string;
  debug?: {
    mediaFound: number;
    graphqlHits: number;
    domVideosFound: number;
    domImagesFound: number;
    interceptedMp4s: number;
    interceptedImages: number;
    landingUrlsFound?: number;
  };
};

type MediaCandidate = {
  kind: "video" | "image";
  url: string;
  body?: string;
};

function detectType(url: string): EnrichResult["pageType"] {
  const lower = url.toLowerCase();
  if (lower.includes("facebook.com/ads/library") || lower.includes("/ads/library")) {
    return "ad_library";
  }
  if (lower.includes("facebook.com/") || lower.includes("fb.com/")) {
    return "fb_page";
  }
  // Checkouts (Hotmart, Kiwify, Eduzz, Stripe, etc) nunca têm VSL embedded —
  // salvar como type='checkout' pro admin ver o destino real e pra não
  // enfileirar VSL extraction.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isCheckoutUrl } = require("@/lib/security") as {
      isCheckoutUrl: (u: string) => boolean;
    };
    if (isCheckoutUrl(url)) return "checkout";
  } catch {
    /* silent — fallback pra main_site */
  }
  return "main_site";
}

/**
 * Abre URL em headless chromium, tira screenshot, tenta extrair dados
 * relevantes, e retorna metadata.
 *
 * Uploads vão pro Supabase via o cliente passado (service role).
 */
export async function enrichUrl(
  supa: SupabaseClient<Database>,
  offerId: string,
  offerSlug: string,
  url: string
): Promise<EnrichResult> {
  const pageType = detectType(url);
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    });
    const page = await context.newPage();

    // ── Coletores de mídia ──
    const graphqlAds: Array<{ videoUrl?: string; imageUrl?: string; body?: string }> = [];
    const interceptedVideos: string[] = [];
    const interceptedImages: string[] = [];
    const landingInterceptedMp4s: string[] = [];
    const landingInterceptedHls: string[] = [];
    let graphqlHits = 0;

    // ── Intercepta responses na página inicial (sempre, pra capturar HLS/mp4 da VSL
    // se URL é uma landing direta) ──
    page.on("response", async (res) => {
      try {
        const reqUrl = res.url();
        const ct = res.headers()["content-type"] || "";
        if (reqUrl.match(/\.m3u8(\?|$)/i) || ct.includes("mpegurl")) {
          if (!landingInterceptedHls.includes(reqUrl)) landingInterceptedHls.push(reqUrl);
        }
        if (reqUrl.match(/\.mp4(\?|$)/i) || ct.startsWith("video/mp4")) {
          if (!landingInterceptedMp4s.includes(reqUrl)) landingInterceptedMp4s.push(reqUrl);
        }
      } catch {}
    });

    // ── Intercepta responses pra Ad Library (GraphQL + media fbcdn) ──
    if (pageType === "ad_library") {
      page.on("response", async (res) => {
        try {
          const reqUrl = res.url();
          const ct = res.headers()["content-type"] || "";

          // 1. GraphQL/JSON responses — procura ad snapshots
          if (
            (reqUrl.includes("graphql") || reqUrl.includes("AdLibrary")) &&
            ct.includes("json")
          ) {
            graphqlHits++;
            const text = await res.text().catch(() => null);
            if (!text) return;
            // Meta às vezes retorna múltiplos JSON documents concatenados
            const parts = text.split(/\n(?={")/);
            for (const p of parts) {
              try {
                const data = JSON.parse(p);
                extractAdsFromGraphQL(data, graphqlAds);
              } catch {}
            }
          }

          // 2. Video files diretos (fbcdn + .mp4)
          if (
            (reqUrl.match(/\.mp4(\?|$)/i) || ct.startsWith("video/")) &&
            reqUrl.includes("fbcdn")
          ) {
            if (!interceptedVideos.includes(reqUrl)) {
              interceptedVideos.push(reqUrl);
            }
          }

          // 3. Images grandes (>30KB heuristic por mime)
          if (ct.startsWith("image/") && reqUrl.includes("fbcdn")) {
            if (reqUrl.match(/\/(t39|p\d+x\d+|s\d+x\d+)/)) {
              // imagem de ad (geralmente nesses paths)
              if (!interceptedImages.includes(reqUrl)) {
                interceptedImages.push(reqUrl);
              }
            }
          }
        } catch {}
      });
    }

    // ── Navigate ──
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Espera network idle (até 10s) pra scripts carregarem
    try {
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
    } catch {
      // ignore — pode ficar em long-polling e nunca estabilizar
    }

    // Dismiss cookie banner se existir (Meta mostra em EU/BR às vezes)
    try {
      const declineBtn = await page.$('[aria-label*="ecline"], [data-cookiebanner="accept_button"]');
      if (declineBtn) await declineBtn.click({ timeout: 2000 }).catch(() => {});
    } catch {}

    // Scroll suave pra carregar lazy content
    await autoScroll(page, 5);

    // ── Title ──
    const pageTitle = await page.title().catch(() => null);

    // ── Ad count (Ad Library) ──
    let adCount: number | null = null;
    if (pageType === "ad_library") {
      adCount = await extractAdCount(page).catch(() => null);
    }

    // ── Screenshot full-page (com fallback pra viewport em páginas enormes
    // tipo Ad Library com scroll infinito) ──
    let screenshotBuffer: Buffer;
    try {
      screenshotBuffer = await page.screenshot({
        fullPage: true,
        type: "jpeg",
        quality: 80,
        timeout: 15_000,
      });
    } catch (err) {
      console.warn(
        `[enrich] fullPage screenshot falhou (${err instanceof Error ? err.message : err}), usando viewport`
      );
      screenshotBuffer = await page.screenshot({
        fullPage: false,
        type: "jpeg",
        quality: 80,
        timeout: 10_000,
      });
    }
    const screenshotPath = `${offerId}/${Date.now()}.jpg`;
    {
      const { error } = await supa.storage
        .from("screenshots")
        .upload(screenshotPath, screenshotBuffer, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/jpeg",
        });
      if (error) throw new Error(`screenshot upload: ${error.message}`);
    }
    const screenshotUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/screenshots/${screenshotPath}`;

    // ── Insert/update page row (ad_library/fb_page/main_site) ──
    await savePageScreenshot(supa, offerId, url, pageType, pageTitle, screenshotBuffer);

    // ── Counters declarados aqui (usados tanto no branch main_site quanto ad_library) ──
    // Se a URL é landing direta, já conta 1 no landingPagesCreated
    let landingPagesCreated = pageType === "main_site" ? 1 : 0;
    let checkoutPagesCreated = 0;
    let vslStoragePath: string | null = null;
    let vslSizeBytes: number | null = null;
    let vslThumbnailPath: string | null = null;
    let landingBodyText: string | null = null;

    // ── Se URL é landing direta (não Ad Library), tenta achar VSL + checkout ──
    if (pageType === "main_site") {
      try {
        await revealHiddenContent(page);

        // Extrai body text pra niche classification
        try {
          landingBodyText = await page.evaluate(() => (document.body?.innerText ?? "").slice(0, 1500));
        } catch {}

        // VSL: força play + procura mp4/HLS
        try {
          await playVideoIfPaused(page);
          await page.waitForTimeout(3000);
          const vsl = await findVslUrl(page, landingInterceptedMp4s, landingInterceptedHls);
          if (vsl) {
            console.log(`[enrich] 🎥 VSL candidato (${vsl.kind}): ${vsl.url.substring(0, 80)}`);
            const r = await downloadVideo(vsl.url, vsl.kind);
            const path = `${offerSlug}.mp4`;
            const { error: vErr } = await supa.storage
              .from("vsls")
              .upload(path, r.buffer, {
                contentType: "video/mp4",
                cacheControl: "3600",
                upsert: true,
              });
            if (!vErr) {
              vslStoragePath = path;
              vslSizeBytes = r.sizeBytes;
              console.log(`[enrich] ✅ VSL uploaded (${(r.sizeBytes / 1024 / 1024).toFixed(1)}MB)`);
              // Thumb do VSL pro bucket público thumbs/
              if (r.thumbBuffer) {
                const thumbPath = `${offerSlug}.jpg`;
                const { error: tErr } = await supa.storage
                  .from("thumbs")
                  .upload(thumbPath, r.thumbBuffer, {
                    contentType: "image/jpeg",
                    cacheControl: "3600",
                    upsert: true,
                  });
                if (!tErr) {
                  vslThumbnailPath = thumbPath;
                  console.log(`[enrich] 🖼️  VSL thumb uploaded`);
                }
              }
            } else {
              console.warn(`[enrich] VSL upload falhou:`, vErr.message);
            }
          }
        } catch (err) {
          console.warn(`[enrich] VSL extraction (landing direta) falhou:`, err instanceof Error ? err.message : err);
        }

        const checkoutUrl = await findCheckoutUrl(page);
        if (checkoutUrl) {
          console.log(`[enrich] 🛒 checkout detectado na landing: ${checkoutUrl.substring(0, 80)}`);
          const ckPage = await context.newPage();
          try {
            await ckPage.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
            try {
              await ckPage.waitForLoadState("networkidle", { timeout: 8_000 });
            } catch {}
            await autoScroll(ckPage, 1);
            const ckTitle = await ckPage.title().catch(() => null);
            const ckShot = await ckPage.screenshot({
              fullPage: true,
              type: "jpeg",
              quality: 78,
              timeout: 15_000,
            }).catch(() =>
              ckPage.screenshot({ fullPage: false, type: "jpeg", quality: 78, timeout: 8_000 })
            );
            await savePageScreenshot(supa, offerId, checkoutUrl, "checkout", ckTitle, ckShot);
            checkoutPagesCreated++;
            console.log(`[enrich] ✅ checkout screenshot salvo`);
          } finally {
            await ckPage.close().catch(() => {});
          }
        }
      } catch (err) {
        console.warn("[enrich] checkout na landing direta falhou:", err instanceof Error ? err.message : err);
      }
    }

    // ── Update offer.ad_count se ad_library ──
    if (adCount !== null && adCount > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa.from("offers") as any)
        .update({ ad_count: adCount })
        .eq("id", offerId);
    }

    // ── Extrai mídia do DOM (fallback mais robusto que GraphQL) ──
    const domVideos: string[] = [];
    const domImages: string[] = [];
    const landingUrls: string[] = [];
    if (pageType === "ad_library") {
      try {
        const media = await page.evaluate(() => {
          const out = {
            videos: [] as string[],
            images: [] as string[],
            landings: [] as string[],
          };
          // Videos: <video> dentro da grid de ads
          document.querySelectorAll("video").forEach((v) => {
            const src = v.getAttribute("src") || v.querySelector("source")?.getAttribute("src");
            if (src && !src.startsWith("blob:")) out.videos.push(src);
          });
          // Images: <img> dentro de ad cards
          // - Aceita qualquer CDN Meta (fbcdn OU scontent)
          // - Tamanho mínimo reduzido pra 120px (cards comprimidos mobile)
          // - Exclui avatares (paths típicos) + emojis
          document.querySelectorAll("img").forEach((img) => {
            const src = img.src;
            if (!src || !src.startsWith("http")) return;
            if (img.naturalWidth < 120 || img.naturalHeight < 120) return;
            // aceita fbcdn, scontent, facebook CDN
            const isMetaCdn =
              src.includes("fbcdn") ||
              src.includes("scontent") ||
              src.includes("facebook.com/rsrc");
            if (!isMetaCdn) return;
            // exclui avatars + UI assets (rsrc.php, emoji fonts)
            if (src.includes("rsrc.php") || src.includes("emoji")) return;
            // exclui thumbs quadradinhos de avatar (~80-100px)
            if (img.naturalWidth < 160 && Math.abs(img.naturalWidth - img.naturalHeight) < 10) {
              return;
            }
            out.images.push(src);
          });
          // Landing URLs: <a> com href pra l.facebook.com/l.php?u=... (redirect externo)
          // ou direto pra domínio externo
          document.querySelectorAll("a[href]").forEach((a) => {
            const href = (a as HTMLAnchorElement).href;
            if (!href) return;
            // FB redirector: decode u=
            const redirMatch = href.match(/l\.(?:facebook|fb)\.com\/l\.php\?u=([^&]+)/);
            if (redirMatch) {
              try {
                out.landings.push(decodeURIComponent(redirMatch[1]));
              } catch {}
              return;
            }
            // Direct external (não facebook, não fbcdn)
            try {
              const u = new URL(href);
              if (
                !u.hostname.includes("facebook.com") &&
                !u.hostname.includes("fbcdn.net") &&
                !u.hostname.includes("fb.com") &&
                !u.hostname.includes("messenger.com") &&
                !u.hostname.includes("instagram.com") &&
                u.protocol.startsWith("http")
              ) {
                out.landings.push(href);
              }
            } catch {}
          });
          return out;
        });
        domVideos.push(...media.videos);
        domImages.push(...media.images);
        landingUrls.push(...media.landings);
      } catch (err) {
        console.warn("[enrich] DOM extraction falhou:", err);
      }
    }

    // ── Consolida candidates — ordem de prioridade: GraphQL > DOM > intercepted ──
    const candidates: MediaCandidate[] = [];
    const seen = new Set<string>();

    function addCandidate(c: MediaCandidate) {
      if (seen.has(c.url)) return;
      seen.add(c.url);
      candidates.push(c);
    }

    // 1. GraphQL ads (videos primeiro)
    for (const a of graphqlAds) {
      if (a.videoUrl) addCandidate({ kind: "video", url: a.videoUrl, body: a.body });
    }
    for (const a of graphqlAds) {
      if (a.imageUrl && !a.videoUrl) addCandidate({ kind: "image", url: a.imageUrl, body: a.body });
    }
    // 2. DOM videos
    for (const v of domVideos) addCandidate({ kind: "video", url: v });
    // 3. Intercepted mp4s
    for (const v of interceptedVideos) addCandidate({ kind: "video", url: v });
    // 4. DOM images — dedupe por "meta image id" (mesma imagem em várias resoluções)
    const imageKey = (url: string): string => {
      // Extrai o hash Meta do path (ex: /462927614_... ou /t45.1600-4/abc...)
      const m = url.match(/\/([a-f0-9_.]+)\.(jpg|jpeg|png|webp)/i);
      return m ? m[1] : url;
    };
    const imgSeenKeys = new Set<string>();
    for (const img of domImages) {
      const k = imageKey(img);
      if (imgSeenKeys.has(k)) continue;
      imgSeenKeys.add(k);
      addCandidate({ kind: "image", url: img });
    }
    // 5. Intercepted images (último recurso — filtra + dedupe)
    for (const img of interceptedImages) {
      const k = imageKey(img);
      if (imgSeenKeys.has(k)) continue;
      imgSeenKeys.add(k);
      addCandidate({ kind: "image", url: img });
    }

    console.log(
      `[enrich] ${url}: graphql=${graphqlHits} ads=${graphqlAds.length} domV=${domVideos.length} domI=${domImages.length} interceptedV=${interceptedVideos.length} interceptedI=${interceptedImages.length} total=${candidates.length}`
    );

    // ── Create creatives (max 5) + thumb pra video ──
    let creativesCreated = 0;
    const topCandidates = candidates.slice(0, 5);
    for (let i = 0; i < topCandidates.length; i++) {
      const c = topCandidates[i];
      try {
        const buffer = await downloadAsBuffer(c.url);
        const ext = c.kind === "video" ? "mp4" : "jpg";
        const contentType = c.kind === "video" ? "video/mp4" : "image/jpeg";
        const ts = Date.now();
        const assetPath = `${offerSlug}/${ts}_${i}.${ext}`;
        const { error: upErr } = await supa.storage
          .from("creatives")
          .upload(assetPath, buffer, { contentType, upsert: true });
        if (upErr) throw upErr;

        // Pra video: gera thumb aos 0.5s via ffmpeg
        let thumbPath: string | null = null;
        if (c.kind === "video") {
          try {
            const { writeFileSync, mkdirSync, rmSync, existsSync } = await import("fs");
            const { join } = await import("path");
            const tmpDir = "/tmp/bbs-creative-thumb";
            if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
            const tmpMp4 = join(tmpDir, `${ts}_${i}.mp4`);
            writeFileSync(tmpMp4, buffer);
            try {
              const thumbBuf = extractThumbFromLocal(tmpMp4);
              thumbPath = `${offerSlug}/${ts}_${i}_thumb.jpg`;
              await supa.storage.from("creatives").upload(thumbPath, thumbBuf, {
                contentType: "image/jpeg",
                upsert: true,
              });
            } finally {
              rmSync(tmpMp4, { force: true });
            }
          } catch (err) {
            console.warn(`[enrich] thumb gen falhou pra creative ${i}:`, err instanceof Error ? err.message : err);
            thumbPath = null;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inserted } = await (supa.from("creatives") as any)
          .insert({
            offer_id: offerId,
            kind: c.kind,
            asset_url: assetPath,
            thumbnail_url: thumbPath,
            caption: c.body ?? null,
            visible: true,
            display_order: i,
          })
          .select("id")
          .single();
        creativesCreated++;

        // Auto-enqueue transcribe_creative pra videos (fica pronto pra baixar)
        if (c.kind === "video" && inserted?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supa.from("jobs") as any).insert({
            kind: "transcribe_creative",
            payload: { creative_id: inserted.id },
            status: "pending",
          });
        }
        console.log(
          `[enrich] ✅ ${c.kind} ${i + 1}/${topCandidates.length} salvo${thumbPath ? " + thumb" : ""}${c.kind === "video" ? " + transcribe enfileirado" : ""}`
        );
      } catch (err) {
        console.warn(`[enrich] ❌ candidate ${i} (${c.kind}) falhou:`, err instanceof Error ? err.message : err);
      }
    }

    // ── Navega nas landing pages extraídas (max 3 domínios únicos + filtros) ──
    const adBodyTexts: string[] = graphqlAds
      .map((a) => a.body ?? "")
      .filter((s) => s.length > 20)
      .slice(0, 5);
    if (pageType === "ad_library" && landingUrls.length > 0) {
      // Conta frequência por hostname — landings reais do anúncio tendem a
      // repetir em vários cards. Lixo Meta aparece só no footer.
      const freqByDomain = new Map<string, number>();
      const firstUrlByDomain = new Map<string, string>();
      const checkoutUrls: string[] = [];
      for (const raw of landingUrls) {
        try {
          const u = new URL(raw);
          // Blocklist: páginas administrativas do Meta/FB (não são landing de vendas)
          const host = u.hostname.toLowerCase();
          if (
            host.includes("metastatus.com") ||
            host.includes("transparency.meta.com") ||
            host.includes("transparency.facebook.com") ||
            host.includes("about.facebook.com") ||
            host.includes("about.meta.com") ||
            host.includes("help.facebook.com") ||
            host.includes("privacy.facebook.com") ||
            host.includes("business.facebook.com") ||
            host.includes("developers.facebook.com") ||
            host === "wa.me" ||
            host.includes("whatsapp.com/catalog") ||
            host.includes("meta.com")
          ) continue;

          // Checkout: NUNCA usado como candidato de VSL. Salva separado pra
          // virar uma page type='checkout' depois — admin vê o destino real.
          if (isCheckoutUrl(raw)) {
            if (!checkoutUrls.includes(raw)) checkoutUrls.push(raw);
            continue;
          }

          freqByDomain.set(host, (freqByDomain.get(host) ?? 0) + 1);
          if (!firstUrlByDomain.has(host)) {
            firstUrlByDomain.set(host, raw);
          }
        } catch {}
      }

      // Registra até 1 checkout como page type='checkout' na oferta
      if (checkoutUrls.length > 0) {
        const checkoutUrl = checkoutUrls[0];
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supa.from("pages") as any).insert({
            offer_id: offerId as string,
            type: "checkout",
            url: checkoutUrl,
            title: `Checkout · ${new URL(checkoutUrl).hostname}`,
            visible: true,
            display_order: 20,
            verified_for_sync: true,
            discovered_via: "enrich_ad_library_checkout_filter",
          });
        } catch {
          /* ignora — pode já existir */
        }
      }

      // Ordena por frequência desc, pega top 3
      const sortedDomains = [...freqByDomain.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      const uniqueByDomain = new Map<string, string>();
      for (const [domain] of sortedDomains) {
        const u = firstUrlByDomain.get(domain);
        if (u) uniqueByDomain.set(domain, u);
      }

      console.log(`[enrich] landing candidates por freq: ${sortedDomains.map(([d, n]) => `${d}(${n})`).join(", ")}`);
      console.log(`[enrich] ${uniqueByDomain.size} landing pages pra screenshot`);

      for (const [, landingUrl] of uniqueByDomain) {
        try {
          const landingPage = await context.newPage();
          try {
            await landingPage.goto(landingUrl, {
              waitUntil: "domcontentloaded",
              timeout: 25_000,
            });
            try {
              await landingPage.waitForLoadState("networkidle", { timeout: 8_000 });
            } catch {}
            await autoScroll(landingPage, 2);
            await revealHiddenContent(landingPage);
            const landingTitle = await landingPage.title().catch(() => null);

            // Extrai body text da PRIMEIRA landing pra niche classification
            if (landingBodyText === null) {
              try {
                landingBodyText = await landingPage.evaluate(() => {
                  const t = document.body?.innerText ?? "";
                  return t.slice(0, 1500);
                });
              } catch {}
            }

            // Tenta extrair VSL: mp4 direto, iframe video, ou HLS interceptado
            if (!vslStoragePath) {
              try {
                // Intercepta mp4/m3u8 especificamente nessa landing page
                const landingMp4s: string[] = [];
                const landingHls: string[] = [];
                landingPage.on("response", (r) => {
                  try {
                    const u = r.url();
                    const ct = r.headers()["content-type"] || "";
                    if (u.match(/\.m3u8(\?|$)/i) || ct.includes("mpegurl")) {
                      if (!landingHls.includes(u)) landingHls.push(u);
                    }
                    if (u.match(/\.mp4(\?|$)/i) || ct.startsWith("video/mp4")) {
                      if (!landingMp4s.includes(u)) landingMp4s.push(u);
                    }
                  } catch {}
                });
                // Forço clicar no player (muitos só carregam HLS após interação)
                await playVideoIfPaused(landingPage);
                await landingPage.waitForTimeout(3000);

                const vsl = await findVslUrl(landingPage, landingMp4s, landingHls);
                if (vsl) {
                  console.log(`[enrich] 🎥 VSL candidato (${vsl.kind}): ${vsl.url.substring(0, 80)}`);
                  const r = await downloadVideo(vsl.url, vsl.kind);
                  const path = `${offerSlug}.mp4`;
                  const { error: vErr } = await supa.storage
                    .from("vsls")
                    .upload(path, r.buffer, {
                      contentType: "video/mp4",
                      cacheControl: "3600",
                      upsert: true,
                    });
                  if (!vErr) {
                    vslStoragePath = path;
                    vslSizeBytes = r.sizeBytes;
                    console.log(`[enrich] ✅ VSL uploaded (${(r.sizeBytes / 1024 / 1024).toFixed(1)}MB)`);
                    // Thumb do VSL
                    if (r.thumbBuffer) {
                      const thumbPath = `${offerSlug}.jpg`;
                      const { error: tErr } = await supa.storage
                        .from("thumbs")
                        .upload(thumbPath, r.thumbBuffer, {
                          contentType: "image/jpeg",
                          cacheControl: "3600",
                          upsert: true,
                        });
                      if (!tErr) {
                        vslThumbnailPath = thumbPath;
                        console.log(`[enrich] 🖼️  VSL thumb uploaded`);
                      }
                    }
                  } else {
                    console.warn(`[enrich] VSL upload falhou:`, vErr.message);
                  }
                }
              } catch (err) {
                console.warn(`[enrich] VSL extraction falhou:`, err instanceof Error ? err.message : err);
              }
            }
            const landingShot = await landingPage
              .screenshot({
                fullPage: true,
                type: "jpeg",
                quality: 78,
                timeout: 15_000,
              })
              .catch(() =>
                landingPage.screenshot({ fullPage: false, type: "jpeg", quality: 78, timeout: 8_000 })
              );
            await savePageScreenshot(
              supa,
              offerId,
              landingUrl,
              "main_site",
              landingTitle,
              landingShot
            );
            landingPagesCreated++;
            console.log(`[enrich] ✅ landing ${landingPagesCreated}: ${landingUrl.substring(0, 80)}`);

            // ── Tenta achar o checkout seguindo CTA (botão "Comprar", "Quero", etc) ──
            const checkoutUrl = await findCheckoutUrl(landingPage);
            if (checkoutUrl) {
              try {
                console.log(`[enrich] 🛒 checkout detectado: ${checkoutUrl.substring(0, 80)}`);
                const checkoutTitle = await landingPage.title().catch(() => null);
                await autoScroll(landingPage, 1);
                const checkoutShot = await landingPage
                  .screenshot({
                    fullPage: true,
                    type: "jpeg",
                    quality: 78,
                    timeout: 15_000,
                  })
                  .catch(() =>
                    landingPage.screenshot({ fullPage: false, type: "jpeg", quality: 78, timeout: 8_000 })
                  );
                await savePageScreenshot(
                  supa,
                  offerId,
                  checkoutUrl,
                  "checkout",
                  checkoutTitle,
                  checkoutShot
                );
                checkoutPagesCreated++;
                console.log(`[enrich] ✅ checkout salvo`);
              } catch (err) {
                console.warn(`[enrich] checkout falhou:`, err instanceof Error ? err.message : err);
              }
            }
          } finally {
            await landingPage.close().catch(() => {});
          }
        } catch (err) {
          console.warn(`[enrich] landing falhou (${landingUrl.substring(0, 60)}):`, err instanceof Error ? err.message : err);
        }
      }
    }

    return {
      ok: true,
      screenshotPath,
      pageType,
      pageTitle,
      adCount,
      creativesCreated,
      landingPagesCreated,
      checkoutPagesCreated,
      vslStoragePath,
      vslSizeBytes,
      vslThumbnailPath,
      landingBodyText,
      adBodyTexts,
      debug: {
        mediaFound: candidates.length,
        graphqlHits,
        domVideosFound: domVideos.length,
        domImagesFound: domImages.length,
        interceptedMp4s: interceptedVideos.length,
        interceptedImages: interceptedImages.length,
        landingUrlsFound: landingUrls.length,
      },
    };
  } catch (err) {
    console.error("[enrich] fatal:", err);
    return {
      ok: false,
      pageType,
      creativesCreated: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      await context?.close();
    } catch {}
    try {
      await browser?.close();
    } catch {}
  }
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

export async function autoScroll(page: Page, rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    await page.evaluate(() =>
      window.scrollBy({ top: window.innerHeight * 0.8, behavior: "smooth" })
    );
    await page.waitForTimeout(600);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
  await page.waitForTimeout(400);
}

/**
 * Expande accordions e clica em elementos que revelam conteúdo (ver mais,
 * saiba mais, etc) pra garantir que CTAs escondidos apareçam no DOM.
 * Só navega se NÃO mudar de URL (pra não quebrar a página).
 */
export async function revealHiddenContent(page: Page) {
  try {
    await page.evaluate(() => {
      // Força display:block em elementos com display:none óbvio
      document.querySelectorAll<HTMLElement>(
        '[aria-expanded="false"], [aria-hidden="true"]'
      ).forEach((el) => {
        el.setAttribute("aria-expanded", "true");
        el.setAttribute("aria-hidden", "false");
      });

      // Remove classes de "collapsed" comuns
      const collapsedClasses = ["collapsed", "hidden", "d-none"];
      document.querySelectorAll<HTMLElement>("details").forEach((d) => {
        d.setAttribute("open", "true");
      });

      // Remove style display:none inline em elementos grandes
      document.querySelectorAll<HTMLElement>('[style*="display: none"], [style*="display:none"]').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 || el.children.length > 0) {
          el.style.display = "";
        }
      });

      // Força que todos os buttons/links do tipo CTA sejam visíveis
      document.querySelectorAll<HTMLElement>("a, button").forEach((el) => {
        const text = el.textContent?.trim().toLowerCase() ?? "";
        if (
          /comprar|garantir|adquirir|quero|checkout|buy|get\s+access|aprender|entrar/i.test(
            text
          )
        ) {
          el.style.display = "";
          el.style.visibility = "visible";
        }
      });
    });

    // Clica em elementos "ver mais" / "saiba mais" que expandem inline
    const expandTexts = [/ver\s+mais/i, /saiba\s+mais/i, /mostrar\s+mais/i, /show\s+more/i];
    const originalUrl = page.url();
    const buttons = await page.$$("button, a");
    for (const btn of buttons.slice(0, 20)) {
      try {
        const text = (await btn.innerText().catch(() => "")).trim();
        if (!text || !expandTexts.some((re) => re.test(text))) continue;
        const href = await btn.getAttribute("href").catch(() => null);
        // Só clica se não é link externo (evita sair da página)
        if (href && /^https?:\/\//.test(href)) continue;
        await btn.click({ timeout: 1500, noWaitAfter: true }).catch(() => {});
        await page.waitForTimeout(300);
        // Se mudou de URL, volta
        if (page.url() !== originalUrl) {
          await page.goBack({ timeout: 5000 }).catch(() => {});
          break;
        }
      } catch {}
    }
  } catch {}
}

async function extractAdCount(page: Page): Promise<number | null> {
  // Meta mostra "~X resultados" / "Results: X"
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  // pt: "~2.400 resultados"; en: "~2,400 results"
  const m = text.match(/~?\s*([\d.,]+)\s+(resultados|results)/i);
  if (m) {
    const n = parseInt(m[1].replace(/[.,]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAdsFromGraphQL(obj: any, collector: Array<{ videoUrl?: string; imageUrl?: string; body?: string }>) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) extractAdsFromGraphQL(item, collector);
    return;
  }
  // Heurística: procura por objetos que parecem "ad snapshots"
  if (obj.snapshot && typeof obj.snapshot === "object") {
    const s = obj.snapshot;
    const videoUrl = s.videos?.[0]?.video_hd_url || s.videos?.[0]?.video_sd_url;
    const imageUrl = s.images?.[0]?.original_image_url || s.images?.[0]?.resized_image_url;
    const body = s.body?.text || s.link_description;
    if (videoUrl || imageUrl) {
      collector.push({ videoUrl, imageUrl, body });
      return;
    }
  }
  // Recurse
  for (const key of Object.keys(obj)) {
    extractAdsFromGraphQL(obj[key], collector);
  }
}

/**
 * Salva screenshot + insere/atualiza row em pages.
 * Idempotente por (offer_id, url).
 */
export async function savePageScreenshot(
  supa: SupabaseClient<Database>,
  offerId: string,
  url: string,
  type: "ad_library" | "fb_page" | "main_site" | "checkout",
  title: string | null,
  buffer: Buffer
): Promise<void> {
  const path = `${offerId}/${type}_${Date.now()}.jpg`;
  const { error: upErr } = await supa.storage
    .from("screenshots")
    .upload(path, buffer, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });
  if (upErr) throw new Error(`screenshot upload: ${upErr.message}`);
  const screenshotUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/screenshots/${path}`;

  const { data: existing } = await supa
    .from("pages")
    .select("id")
    .eq("offer_id", offerId)
    .eq("url", url)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("pages") as any)
      .update({
        type,
        title,
        screenshot_url: screenshotUrl,
        fetched_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("pages") as any).insert({
      offer_id: offerId,
      type,
      url,
      title,
      screenshot_url: screenshotUrl,
      fetched_at: new Date().toISOString(),
      visible: true,
    });
  }
}

/**
 * Tenta clicar no CTA principal da landing (botões tipo "Comprar",
 * "Quero garantir", "Adquirir", etc) e detecta se navegou pra um domínio
 * de checkout conhecido.
 *
 * Retorna a URL do checkout se encontrou, null se não.
 */
async function findCheckoutUrl(page: Page): Promise<string | null> {
  const originalUrl = page.url();
  const originalHost = new URL(originalUrl).hostname;

  // Domínios de checkout conhecidos no mercado BR/internacional
  const checkoutHosts = [
    "hotmart.com",
    "pay.hotmart.com",
    "monetizze.com.br",
    "app.monetizze.com.br",
    "kiwify.com.br",
    "pay.kiwify.com",
    "perfectpay.com.br",
    "app.perfectpay.com.br",
    "kirvano.com",
    "pay.kirvano.com",
    "eduzz.com",
    "sun.eduzz.com",
    "chk.eduzz.com",
    "ticto.com.br",
    "ticto.app",
    "payt.com.br",
    "pagar.me",
    "pagseguro.uol.com.br",
    "mercadopago.com.br",
    "stripe.com",
    "checkout.stripe.com",
    "lastlink.com",
    "braip.com",
    "app.braip.com",
    "greenn.com.br",
    "cademi.com.br",
    "yampi.com.br",
    "appmax.com.br",
    "adoorei.com.br",
  ];

  try {
    // ESTRATÉGIA 1 — varre TODOS os <a> da página procurando href que aponta
    // pra domínio de checkout conhecido. Não precisa match textual.
    const hrefs = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll("a[href]").forEach((a) => {
        const h = (a as HTMLAnchorElement).href;
        if (h && h.startsWith("http")) out.push(h);
      });
      return out;
    });

    for (const href of hrefs) {
      try {
        const u = new URL(href, originalUrl);
        const hostLower = u.hostname.toLowerCase();
        if (
          hostLower !== originalHost &&
          checkoutHosts.some((h) => hostLower.includes(h))
        ) {
          return u.toString();
        }
      } catch {}
    }

    // ESTRATÉGIA 2 — procura CTA por texto e tenta clicar
    const ctaTexts = [
      /quero\s+(garant|adquir|ter|comprar|acessar|aprender|entrar)/i,
      /comprar\s+(agora|j[áa])/i,
      /adquirir/i,
      /garantir/i,
      /acessar\s+agora/i,
      /sim[,!]?\s+eu\s+quero/i,
      /(^|\s)buy\s+now/i,
      /(^|\s)get\s+access/i,
      /checkout/i,
      /finalizar/i,
      /clique\s+aqui/i,
    ];

    const buttons = await page.$$("a, button");
    for (const btn of buttons) {
      const text = (await btn.innerText().catch(() => "")).trim();
      if (!text || text.length > 80) continue;
      if (!ctaTexts.some((re) => re.test(text))) continue;

      const href = await btn.getAttribute("href").catch(() => null);
      if (href) {
        try {
          const resolved = new URL(href, originalUrl);
          if (resolved.hostname.toLowerCase() !== originalHost) {
            return resolved.toString();
          }
        } catch {}
      }

      // Último recurso: click pra ver se navega
      try {
        const [nav] = await Promise.all([
          page.waitForEvent("framenavigated", { timeout: 8_000 }).catch(() => null),
          btn.click({ timeout: 3_000, noWaitAfter: true }),
        ]);
        if (nav) {
          await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(() => {});
          const newUrl = page.url();
          const newHost = new URL(newUrl).hostname.toLowerCase();
          if (newHost !== originalHost) return newUrl;
        }
        break;
      } catch {
        continue;
      }
    }
  } catch {}
  return null;
}

/**
 * Muitos players de VSL (Vturb, ConverteAI, Panda) só carregam o stream
 * DEPOIS que o user clica play. Força play programático + click em elementos
 * que parecem ser o overlay do player.
 */
export async function playVideoIfPaused(page: Page) {
  try {
    // 1. Play nativo nos <video> do DOM main
    await page.evaluate(() => {
      document.querySelectorAll("video").forEach((v) => {
        try {
          v.muted = true;
          v.play().catch(() => {});
        } catch {}
      });
    });

    // 2. Play em videos de iframes
    for (const frame of page.frames()) {
      try {
        await frame.evaluate(() => {
          document.querySelectorAll("video").forEach((v) => {
            try {
              v.muted = true;
              v.play().catch(() => {});
            } catch {}
          });
        });
      } catch {}
    }

    // 3. Click em divs que parecem overlay/thumb de player
    // Heurística: elementos fixed/absolute no meio da página com aspect ~16:9
    const candidates = await page.$$eval("*", (els) => {
      const vp = { w: window.innerWidth, h: window.innerHeight };
      const hits: number[] = [];
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 150) return;
        if (r.width > vp.w * 1.2 || r.height > vp.h * 1.2) return;
        const ratio = r.width / r.height;
        if (ratio < 1.4 || ratio > 2.2) return;
        // aproximadamente centralizado
        const cx = (r.left + r.right) / 2;
        if (Math.abs(cx - vp.w / 2) > vp.w * 0.25) return;
        hits.push(i);
      });
      return hits.slice(0, 5);
    });
    for (const idx of candidates) {
      try {
        const handles = await page.$$("*");
        const h = handles[idx];
        if (h) {
          await h.click({ timeout: 1500, noWaitAfter: true }).catch(() => {});
          await page.waitForTimeout(400);
        }
      } catch {}
    }
  } catch {}
}

/**
 * Tenta achar URL de vídeo da VSL na landing page.
 * Retorna `{ url, kind: "mp4" | "hls" }` ou null.
 *
 * Players modernos de infoproduto brasileiro (Vturb, ConverteAI, Panda)
 * usam HLS streaming — não mp4 direto. Detectamos via m3u8 interceptado.
 */
/**
 * Detecta mp4 URLs que são placeholder/decoy de players conhecidos.
 * ConverteAI/Vturb usam "1.mp4" na raiz do CDN como decoy de 3s
 * enquanto o HLS real carrega em background.
 */
function isDecoyMp4(url: string): boolean {
  if (/\/1\.mp4(\?|$)/i.test(url)) return true;
  if (/cdn\.converteai\.net\/(1|placeholder|preview)\.mp4/i.test(url)) return true;
  if (/vturb.*?\/default\.mp4/i.test(url)) return true;
  return false;
}

export async function findVslUrl(
  page: Page,
  interceptedMp4s: string[] = [],
  interceptedHls: string[] = []
): Promise<{ url: string; kind: "mp4" | "hls" } | null> {
  try {
    // ── PRIORIDADE 1: HLS interceptado (m3u8). Players modernos (Vturb,
    // ConverteAI, Panda) servem o VSL real via HLS — o <video> no DOM
    // geralmente tem decoy mp4. Se achou HLS, USA HLS.
    //
    // Ordenação priorizada (caso real: Akenia Bittencourt):
    //   Lista vinha [cdn.converteai/main.m3u8 (403), vturb/auth-token/main.m3u8]
    //   find("main.m3u8") pegava a 1ª (cdn raw, 403 forbidden) → ffmpeg morria
    //
    // Fix: scoring + HEAD-check pra descartar URLs sem auth.
    if (interceptedHls.length > 0) {
      const score = (u: string): number => {
        let s = 0;
        // Token signed (vturb usa `/t-XXXX=YYYY/` no path) — URL viva
        if (/\/t-[A-Za-z0-9_=]+\//.test(u)) s += 100;
        // Domínios conhecidos com auth
        if (u.includes("vturb.net")) s += 80;
        if (u.includes("bunnycdn") || u.includes("b-cdn.net")) s += 60;
        if (u.includes("pandavideo")) s += 60;
        // Master playlist
        if (u.includes("main.m3u8") || u.includes("playlist.m3u8")) s += 30;
        // Quality hint
        if (u.includes("1080")) s += 10;
        if (u.includes("720")) s += 8;
        // Penalidade: CDN raw sem token (frequentemente 403)
        if (u.includes("cdn.converteai.net") && !/\/t-/.test(u)) s -= 50;
        return s;
      };
      const sorted = [...interceptedHls].sort((a, b) => score(b) - score(a));

      // HEAD-check: descarta URLs que retornam 4xx. Para na primeira viva.
      for (const u of sorted) {
        try {
          const r = await fetch(u, {
            method: "HEAD",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
              Referer: page.url(),
            },
          });
          if (r.ok || r.status === 206) {
            console.log(
              `[findVslUrl] HLS escolhido (score=${score(u)}, status=${r.status}): ${u.slice(0, 100)}`
            );
            return { url: u, kind: "hls" };
          }
          console.log(
            `[findVslUrl] HLS rejeitado (status=${r.status}): ${u.slice(0, 80)}`
          );
        } catch {
          // Network error — pula
        }
      }
      // Fallback: nenhuma passou no HEAD. Alguns servers bloqueiam HEAD
      // mas aceitam GET. Retorna a melhor scored.
      console.log(
        `[findVslUrl] nenhuma HLS passou HEAD-check, fallback pra melhor scored`
      );
      return { url: sorted[0], kind: "hls" };
    }

    // ── PRIORIDADE 2: <video> DOM com mp4 direto (filtra decoys) ──
    const direct = await page.evaluate(() => {
      const vids = Array.from(document.querySelectorAll("video"));
      for (const v of vids) {
        const src = v.getAttribute("src") || v.querySelector("source")?.getAttribute("src") || "";
        if (src.match(/\.mp4(\?|$)/i)) return src;
      }
      return null;
    });
    if (direct && direct.startsWith("http") && !isDecoyMp4(direct)) {
      return { url: direct, kind: "mp4" };
    }

    // ── PRIORIDADE 3: <iframe> player com video mp4 ──
    const frames = page.frames();
    for (const frame of frames) {
      try {
        const frameVideo = await frame.evaluate(() => {
          const v = document.querySelector("video");
          if (!v) return null;
          return (
            v.getAttribute("src") ||
            v.querySelector("source")?.getAttribute("src") ||
            null
          );
        });
        if (
          frameVideo &&
          frameVideo.startsWith("http") &&
          frameVideo.match(/\.mp4(\?|$)/i) &&
          !isDecoyMp4(frameVideo)
        ) {
          return { url: frameVideo, kind: "mp4" };
        }
      } catch {}
    }

    // ── PRIORIDADE 4: mp4 interceptado (evita decoys) ──
    if (interceptedMp4s.length > 0) {
      const realMp4 = interceptedMp4s.find((u) => !isDecoyMp4(u));
      if (realMp4) return { url: realMp4, kind: "mp4" };
    }
  } catch {}
  return null;
}

/**
 * Download mp4 direto ou stream HLS (m3u8) via ffmpeg → mp4 local.
 * Retorna Buffer + thumb (frame aos 3s) pra usar como preview da oferta.
 */
export async function downloadVideo(
  url: string,
  kind: "mp4" | "hls"
): Promise<{ buffer: Uint8Array; sizeBytes: number; thumbBuffer?: Uint8Array }> {
  const { spawnSync } = await import("child_process");
  const { readFileSync, mkdirSync, rmSync, existsSync, statSync } = await import("fs");
  const { join } = await import("path");
  const { isSafeExternalUrl } = await import("@/lib/security");

  // Valida URL antes de ffmpeg fetch — previne SSRF via m3u8 apontando
  // pra IP interno (localhost, metadata cloud, etc)
  const safe = isSafeExternalUrl(url);
  if (!safe.safe) {
    throw new Error(`unsafe_url: ${safe.reason}`);
  }

  const tmpDir = "/tmp/bbs-worker-hls";
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  const outPath = join(tmpDir, `vsl_${Date.now()}.mp4`);

  if (kind === "mp4") {
    const buffer = await downloadAsBuffer(url);
    // Salva local temporariamente pra extrair thumb
    let thumbBuffer: Uint8Array | undefined;
    try {
      const tmpPath = join(tmpDir, `mp4_${Date.now()}.mp4`);
      await import("fs").then((fs) => fs.writeFileSync(tmpPath, buffer));
      thumbBuffer = extractThumbFromLocal(tmpPath);
      rmSync(tmpPath, { force: true });
    } catch {}
    return { buffer, sizeBytes: buffer.byteLength, thumbBuffer };
  }

  // HLS: ffmpeg download + re-encode agressivo pra caber no Supabase Pro.
  // Ladder vai de qualidade decente (720p) até modo "só pra transcribe"
  // (144p audio mono 24k). VSLs muito longas (90min+ desafios completos)
  // exigem o último step. Preset ULTRAFAST pra não travar em VSLs longos.
  const MAX_BYTES = 480 * 1024 * 1024; // 480MB — usa quase todo o teto do bucket (500MB)
  const ladder = [
    { crf: 30, height: 720, audioBr: "64k" },
    { crf: 34, height: 540, audioBr: "48k" },
    { crf: 38, height: 360, audioBr: "32k" },
    { crf: 42, height: 240, audioBr: "24k" }, // VSL muito longa (60-90min)
    { crf: 46, height: 144, audioBr: "16k" }, // último recurso pra transcribe-only (>90min)
  ];

  try {
    for (const step of ladder) {
      try {
        console.log(
          `[downloadVideo] tentando CRF ${step.crf} / ${step.height}p (preset ultrafast)...`
        );
        // Args array (não shell) — não interpola variáveis no shell, zero risco
        // de command injection mesmo se url tiver aspas/backticks/$/etc.
        const res = spawnSync(
          "ffmpeg",
          [
            "-y",
            "-referer", "https://www.facebook.com/",
            "-user_agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "-i", url,
            "-c:v", "libx264",
            "-crf", String(step.crf),
            "-preset", "ultrafast",
            "-vf", `scale=-2:'min(${step.height},ih)'`,
            "-c:a", "aac",
            "-b:a", step.audioBr,
            "-ac", "1",
            "-movflags", "+faststart",
            outPath,
          ],
          { stdio: "pipe", timeout: 1_500_000 }
        );
        if (res.status !== 0) {
          throw new Error(
            `ffmpeg_failed status=${res.status} stderr=${(res.stderr?.toString() ?? "").slice(-200)}`
          );
        }
        const size = statSync(outPath).size;
        console.log(
          `[downloadVideo] CRF ${step.crf} / ${step.height}p → ${(size / 1024 / 1024).toFixed(1)}MB ${size <= MAX_BYTES ? "✓" : "(muito grande)"}`
        );
        if (size <= MAX_BYTES) {
          const buffer = readFileSync(outPath);
          let thumbBuffer: Uint8Array | undefined;
          try {
            thumbBuffer = extractThumbFromLocal(outPath);
          } catch {}
          return { buffer: new Uint8Array(buffer), sizeBytes: size, thumbBuffer };
        }
        // muito grande — tenta próximo CRF
        rmSync(outPath);
      } catch (err) {
        console.warn(`[downloadVideo] ffmpeg CRF ${step.crf} falhou:`, err instanceof Error ? err.message : err);
      }
    }
    throw new Error(
      `vsl_too_large: não coube em ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB ` +
        `mesmo com CRF 46 / 144p / mono 16k. VSL provavelmente é >2h. ` +
        `Considera upload manual ou pega só áudio.`
    );
  } finally {
    try {
      if (existsSync(outPath)) rmSync(outPath);
    } catch {}
  }
}

/**
 * Extrai thumb (JPEG) de um mp4 local aos 3 segundos via ffmpeg.
 * Retorna Uint8Array ou throw se ffmpeg falhar.
 */
export function extractThumbFromLocal(mp4Path: string): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawnSync } = require("child_process");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync, rmSync } = require("fs");
  const tmpThumb = `${mp4Path}_thumb.jpg`;
  try {
    // Args array — zero risco de shell injection mesmo se mp4Path tiver
    // caracteres especiais (é path local, mas defense-in-depth).
    const res = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-ss", "00:00:03",
        "-i", mp4Path,
        "-vframes", "1",
        "-vf", "scale=1280:-2",
        "-q:v", "3",
        tmpThumb,
      ],
      { stdio: "pipe", timeout: 30_000 }
    );
    if (res.status !== 0) {
      throw new Error(`ffmpeg_thumb_failed status=${res.status}`);
    }
    const buf = readFileSync(tmpThumb);
    return new Uint8Array(buf);
  } finally {
    try { rmSync(tmpThumb, { force: true }); } catch {}
  }
}

async function downloadAsBuffer(url: string): Promise<Uint8Array> {
  // Facebook CDN aceita requests com referer + UA. Sem eles retorna 403 as vezes.
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      referer: "https://www.facebook.com/",
      accept: "video/mp4,video/*;q=0.9,image/avif,image/webp,image/apng,image/*;q=0.8,*/*;q=0.5",
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`download ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}
