import { chromium as chromiumBase, type Browser } from "playwright";

/**
 * Browser singleton — reutiliza a mesma instância de Chromium pra todos os
 * jobs. Economiza 1-2s de cold boot por job. Usa contextos separados pra
 * isolamento (cookies, session).
 *
 * Reboot automático a cada N jobs (default 50) pra evitar memory leak
 * cumulativo em processos de longa duração.
 *
 * Se playwright-extra + stealth plugin estiverem instalados, usa eles
 * (reduz detecção de headless pelo FB).
 */

// ── Stealth plugin (opcional) ──
// Carrega dinamicamente. Se o package não estiver instalado, cai pro
// chromium normal sem quebrar.
type ChromiumLauncher = {
  launch: typeof chromiumBase.launch;
};

let chromium: ChromiumLauncher = chromiumBase;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const extra = require("playwright-extra");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const stealth = require("puppeteer-extra-plugin-stealth");
  if (extra?.chromium && typeof extra.chromium.use === "function") {
    extra.chromium.use(stealth());
    chromium = extra.chromium as ChromiumLauncher;
    console.log("[browser] playwright-extra + stealth ativados");
  }
} catch {
  // playwright-extra não instalado — usa o chromium padrão
}

let browserPromise: Promise<Browser> | null = null;
let jobsSinceLaunch = 0;

const REBOOT_AFTER_JOBS = parseInt(
  process.env.BROWSER_REBOOT_AFTER ?? "50",
  10
);

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
}

export async function getBrowser(): Promise<Browser> {
  // Reboot preventivo se excedeu threshold
  if (browserPromise && jobsSinceLaunch >= REBOOT_AFTER_JOBS) {
    console.log(
      `[browser] reboot preventivo após ${jobsSinceLaunch} jobs (limite=${REBOOT_AFTER_JOBS})`
    );
    const old = browserPromise;
    browserPromise = null;
    jobsSinceLaunch = 0;
    // Fecha a instância antiga sem bloquear
    old.then((b) => b.close().catch(() => {})).catch(() => {});
  }

  if (!browserPromise) {
    browserPromise = launchBrowser();
    jobsSinceLaunch = 0;
  }
  jobsSinceLaunch++;
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {}
    browserPromise = null;
    jobsSinceLaunch = 0;
  }
}

/** Estatísticas pro /api/worker/health futuro */
export function getBrowserStats() {
  return {
    running: !!browserPromise,
    jobs_since_launch: jobsSinceLaunch,
    reboot_after: REBOOT_AFTER_JOBS,
  };
}
