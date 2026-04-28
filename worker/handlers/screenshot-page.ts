import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { savePageScreenshot } from "@/lib/worker/enrich";
import { getBrowser } from "../shared-browser";

type Supa = SupabaseClient<Database>;

/**
 * Handler: screenshot_page
 * Versão FAST — otimizada pra screenshots de lista:
 *   - Browser global reutilizado (sem cold boot de ~1-2s por job)
 *   - Bloqueia assets pesados (vídeos, fonts, analytics, ads trackers)
 *   - Só 1 quick scroll pra disparar lazy-load do hero
 *   - Network idle curto (3s, não 8s)
 *   - JPEG quality 75 (em vez de 80)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleScreenshotPage(supa: Supa, payload: any): Promise<void> {
  const { page_id } = payload as { page_id: string };
  if (!page_id) throw new Error("missing page_id");

  const { data: pageRow } = await supa
    .from("pages")
    .select("id, offer_id, url, type")
    .eq("id", page_id)
    .maybeSingle<{ id: string; offer_id: string; url: string; type: string }>();
  if (!pageRow) throw new Error("page_not_found");

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
    // Bloqueia carregamento de service workers (GA, hotjar, etc fazem install)
    serviceWorkers: "block",
  });

  try {
    const page = await context.newPage();

    // Block heavy/unnecessary resources pra reduzir tempo de load
    await page.route("**/*", (route) => {
      const req = route.request();
      const type = req.resourceType();
      // Media (vídeos HTML5) e font são pesados e não afetam screenshot
      if (type === "media" || type === "font") return route.abort();
      // Analytics, pixels, trackers — inúteis pro screenshot
      const url = req.url();
      if (
        /google-analytics\.com|googletagmanager|doubleclick|hotjar|clarity\.ms|facebook\.com\/tr|connect\.facebook\.net|mixpanel|segment\.io|intercom|drift\.com/.test(
          url
        )
      ) {
        return route.abort();
      }
      route.continue();
    });

    await page.goto(pageRow.url, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });

    // Network idle curto — só pra pegar assets críticos acima do fold
    try {
      await page.waitForLoadState("networkidle", { timeout: 3_000 });
    } catch {}

    // Quick scroll pra disparar lazy-load de imagens no primeiro viewport
    try {
      await page.evaluate(() => {
        window.scrollBy({ top: 800, behavior: "instant" as ScrollBehavior });
      });
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      });
      await page.waitForTimeout(200);
    } catch {}

    const title = await page.title().catch(() => null);
    const buffer = await page.screenshot({
      fullPage: true,
      type: "jpeg",
      quality: 75,
    });
    const validType = (
      ["ad_library", "fb_page", "main_site", "checkout"].includes(pageRow.type)
        ? pageRow.type
        : "main_site"
    ) as "ad_library" | "fb_page" | "main_site" | "checkout";

    await savePageScreenshot(
      supa,
      pageRow.offer_id,
      pageRow.url,
      validType,
      title,
      buffer
    );
  } finally {
    // NÃO fecha o browser — global + reuse. Só fecha o context.
    try {
      await context.close();
    } catch {}
  }
}
