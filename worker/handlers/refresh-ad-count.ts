import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { extractAdCount } from "@/lib/worker/ad-count-extractor";
import { fetchActiveAdsByPage, isApiEnabled } from "@/lib/worker/ad-library-api";
import { countriesForOfferLanguage } from "@/lib/worker/offer-countries";
import {
  fetchActiveAdsByDomain,
  extractSearchDomain,
  adLibraryPageUrl,
} from "@/lib/worker/ad-library-domain-search";
import { syncCreativesFromApi } from "@/lib/worker/sync-creatives-from-api";
import { getBrowser } from "../shared-browser";

type Supa = SupabaseClient<Database>;

type AdLibPage = {
  id: string;
  url: string;
  meta_page_id: string | null;
  display_order: number | null;
};

/**
 * Handler: refresh_ad_count (cascata de 3 layers)
 *
 * Payload: { offer_id: string }
 *
 * Fluxo:
 *   1. Busca TODAS as ad_library pages da oferta (não mais .limit(1))
 *   2. Para cada uma: tenta API → scrape (Layer 1 + Layer 2)
 *      Soma count agregado across all pages
 *   3. Se total = 0 E oferta tem main_site URL:
 *      Layer 3 — fetchActiveAdsByDomain → descobre page_ids novos
 *      Insere rows novas em pages pra cada page_id desconhecido
 *   4. Insert snapshot em offer_metrics
 *   5. Update offers.ad_count + last_refreshed_at
 *   6. Enqueue compute_scale_score
 *
 * Multi-Page advertisers (tipo Paulo Borges com 2 Pages simultâneas):
 *   - Refresh após discovery sweep já tem ambas cadastradas
 *   - Layer 1+2 soma count das duas
 *   - Scale score reflete total consolidado
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleRefreshAdCount(supa: Supa, payload: any): Promise<void> {
  const { offer_id } = payload as { offer_id: string };
  if (!offer_id) throw new Error("missing_offer_id");

  const { data: offer } = await supa
    .from("offers")
    .select("id, status, ad_count, language")
    .eq("id", offer_id)
    .maybeSingle<{ id: string; status: string; ad_count: number | null; language: string | null }>();

  if (!offer) throw new Error("offer_not_found");

  // Países pra busca — baseado no idioma da oferta (pt-BR → [BR,PT],
  // en-US → [US,GB,CA,AU], es-ES → [ES,MX,AR,CO,CL])
  // Isso corrige bug de ofertas internacionais aparecendo com 0 ads
  // porque antes filtrávamos apenas "BR".
  const countries = countriesForOfferLanguage(offer.language);

  // ─── 1. Busca TODAS as ad_library pages ───────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: adLibPages } = await (supa as any)
    .from("pages")
    .select("id, url, meta_page_id, display_order")
    .eq("offer_id", offer_id)
    .eq("type", "ad_library")
    .eq("visible", true)
    .order("display_order", { ascending: true })
    .returns<AdLibPage[]>();

  // ─── 2. Busca main_site URL (pro Layer 3 fallback) ────────────
  const { data: landingPages } = await supa
    .from("pages")
    .select("url, type")
    .eq("offer_id", offer_id)
    .in("type", ["main_site", "checkout"])
    .order("display_order", { ascending: true })
    .returns<{ url: string; type: string }[]>();

  // Prioriza main_site, fallback pra checkout
  const mainSiteUrl =
    landingPages?.find((p) => p.type === "main_site")?.url ??
    landingPages?.find((p) => p.type === "checkout")?.url ??
    null;
  const domain = mainSiteUrl ? extractSearchDomain(mainSiteUrl) : null;

  // ─── Edge case: sem ad_library E sem main_site ────────────────
  if ((!adLibPages || adLibPages.length === 0) && !domain) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("offers") as any)
      .update({ last_refreshed_at: new Date().toISOString() })
      .eq("id", offer_id);
    console.log(
      `[refresh_ad_count] offer ${offer_id.slice(0, 8)} sem ad_library nem main_site — skip`
    );
    return;
  }

  // ─── 3. Conta creatives ativos (pro snapshot) ─────────────────
  const { count: creativeCount } = await supa
    .from("creatives")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", offer_id)
    .eq("visible", true)
    .eq("kind", "video");

  // ─── 4. Layer 1+2: itera todas pages, tenta API → scrape ──────
  let totalCount = 0;
  const sources: string[] = [];
  const knownPageIds = new Set<string>();

  for (const adLibPage of adLibPages ?? []) {
    const pageLabel = adLibPage.meta_page_id?.slice(0, 8) ?? adLibPage.id.slice(0, 8);
    let pageCount: number | null = null;
    let pageSource = "none";

    // Layer 1: API by page_id
    let apiCount: number | null = null;
    if (isApiEnabled() && adLibPage.meta_page_id) {
      const apiRes = await fetchActiveAdsByPage(adLibPage.meta_page_id, countries, undefined, 25, {
        caller_handler: "refresh_ad_count",
        offer_id,
      });
      if (!apiRes.blocked && apiRes.count !== null) {
        apiCount = apiRes.count;
        pageCount = apiCount;
        pageSource = "api";
        knownPageIds.add(adLibPage.meta_page_id);
      }
    }

    // Layer 2: Playwright scrape
    // Roda quando:
    //   a) API blocked/null (sem resposta)
    //   b) API retornou número BAIXO (<20) — divergência entre API e UI é
    //      conhecida: Graph API /ads_archive filtra por ad_reached_countries
    //      mesmo com "ALL", ignorando ads sem DSA disclosure; a UI agrega
    //      todos. Ex: Natalia Beauty retorna API=1 mas UI=130.
    // Quando roda scrape:
    //   - se scrape > api → usa scrape (UI tem cobertura melhor em divergência)
    //   - senão mantém api (scrape pode falhar, confia no número menor real)
    const SCRAPE_VALIDATION_THRESHOLD = 20;
    const shouldValidate =
      pageCount === null ||
      (apiCount !== null && apiCount < SCRAPE_VALIDATION_THRESHOLD);
    if (shouldValidate) {
      const scrapeCount = await scrapePageUrl(adLibPage.url);
      if (scrapeCount !== null) {
        if (pageCount === null) {
          pageCount = scrapeCount;
          pageSource = "scrape";
        } else if (scrapeCount > apiCount!) {
          // UI mostra mais ads que API — usa o da UI (caso comum)
          pageCount = scrapeCount;
          pageSource = `scrape_override_api(${apiCount})`;
          console.log(
            `[refresh_ad_count] offer ${offer_id.slice(0, 8)} page=${pageLabel} · API=${apiCount} mas scrape=${scrapeCount} → usando scrape`
          );
        }
        if (adLibPage.meta_page_id) knownPageIds.add(adLibPage.meta_page_id);
      }
    }

    if (pageCount !== null) {
      totalCount += pageCount;
      sources.push(`${pageLabel}:${pageSource}=${pageCount}`);
    } else {
      sources.push(`${pageLabel}:failed`);
    }
  }

  // ─── 5. Layer 3: Domain fallback se Layer 1+2 = 0 ─────────────
  let newPagesInserted = 0;
  if (totalCount === 0 && domain) {
    console.log(
      `[refresh_ad_count] offer ${offer_id.slice(0, 8)} · Layer 1+2 zerou · tentando domain="${domain}"`
    );
    const browser = await getBrowser();
    const domainRes = await fetchActiveAdsByDomain(domain, countries, browser);

    if (domainRes.count !== null && domainRes.count > 0) {
      totalCount = domainRes.count;
      sources.push(`domain[${domainRes.source}]=${domainRes.count}`);

      // Descobriu page_ids novos? Insere rows em pages
      for (const newPageId of domainRes.page_ids) {
        if (knownPageIds.has(newPageId)) continue;
        // Threshold: só cria row se tiver ≥2 ads (evita spam/clones com 1 ad)
        const pageAdCount = domainRes.count_by_page_id[newPageId] ?? 0;
        if (pageAdCount < 2) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insErr } = await (supa.from("pages") as any).insert({
          offer_id,
          type: "ad_library",
          url: adLibraryPageUrl(newPageId, countries),
          title: `Ad Library · descoberta via ${domain}`,
          meta_page_id: newPageId,
          visible: true,
          display_order:
            Math.max(
              ...(adLibPages ?? []).map((p) => p.display_order ?? 0),
              0
            ) + 1 + newPagesInserted,
        });

        if (!insErr) {
          newPagesInserted++;
          console.log(
            `[refresh_ad_count] offer ${offer_id.slice(0, 8)} · descobriu page_id=${newPageId} (${pageAdCount} ads) — row inserida`
          );
          knownPageIds.add(newPageId);
        } else {
          console.warn(
            `[refresh_ad_count] insert page error:`,
            insErr.message
          );
        }
      }
    } else if (domainRes.error) {
      sources.push(`domain[${domainRes.source}]:err=${domainRes.error.slice(0, 40)}`);
    } else {
      sources.push(`domain[${domainRes.source}]=0`);
    }
  }

  // ─── 6. Validação: se nem Layer 1+2+3 retornou nada, erro ────
  // Distingue zero real vs falha de extração
  const nothingWorked =
    (adLibPages ?? []).length > 0 && // tinha pages pra tentar
    totalCount === 0 && // mas veio zero
    sources.every((s) => s.endsWith(":failed") || s.includes(":err=")); // e tudo falhou

  if (nothingWorked) {
    throw new Error(
      `extraction_failed: all layers failed (${sources.join(", ")})`
    );
  }

  // ─── 7. Insert snapshot + update offer ───────────────────────
  const now = new Date().toISOString();
  const finalCount = totalCount;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: metricsErr } = await (supa.from("offer_metrics") as any).insert({
    offer_id,
    time_window: "snapshot_1d",
    ad_count: finalCount,
    creative_count: creativeCount ?? 0,
    sampled_at: now,
  });
  if (metricsErr) {
    console.warn(`[refresh_ad_count] insert snapshot error:`, metricsErr.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa.from("offers") as any)
    .update({
      ad_count: finalCount,
      last_refreshed_at: now,
    })
    .eq("id", offer_id);

  console.log(
    `[refresh_ad_count] offer ${offer_id.slice(0, 8)} · total=${finalCount}` +
      ` · pages=${(adLibPages ?? []).length}${newPagesInserted > 0 ? "+" + newPagesInserted : ""}` +
      ` · src=[${sources.join(", ")}]` +
      ` · creatives=${creativeCount ?? 0}`
  );

  // ─── 8. Sync criativos via API (baixa até 20 VIDEOS reais) ────
  try {
    const browser = await getBrowser();
    const sync = await syncCreativesFromApi(supa, offer_id, {
      countries,
      dispatchAlerts: true,
      browser,
    });
    if (
      !sync.skipped &&
      (sync.videos_downloaded > 0 || sync.images_downloaded > 0 || sync.stopped > 0)
    ) {
      console.log(
        `[refresh_ad_count] offer ${offer_id.slice(0, 8)} · sync: +${sync.videos_downloaded}v +${sync.images_downloaded}i · ${sync.media_skipped} skip · ${sync.download_failed} fail · ${sync.stopped} stopped · api=${sync.api_total}`
      );
    }
    if (sync.errors.length > 0 && sync.errors.length < 5) {
      console.warn(
        `[refresh_ad_count] offer ${offer_id.slice(0, 8)} · sync errors: ${sync.errors.slice(0, 3).join(" | ")}`
      );
    }
  } catch (err) {
    console.warn(
      `[refresh_ad_count] offer ${offer_id.slice(0, 8)} · sync exception:`,
      err instanceof Error ? err.message : err
    );
  }

  // ─── 9. Enfileira compute_scale_score ─────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa.from("jobs") as any).insert({
    kind: "compute_scale_score",
    payload: { offer_id },
    status: "pending",
  });
}

/**
 * Helper: scrapa uma Ad Library page específica (URL com view_all_page_id)
 * e extrai o ad_count. Reusa a lógica existente do extractAdCount.
 */
async function scrapePageUrl(url: string): Promise<number | null> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
    serviceWorkers: "block",
  });

  try {
    const page = await context.newPage();

    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "media" || type === "font" || type === "image") {
        return route.abort();
      }
      const reqUrl = route.request().url();
      if (
        /google-analytics|googletagmanager|doubleclick|hotjar|clarity\.ms|mixpanel|segment\.io/.test(
          reqUrl
        )
      ) {
        return route.abort();
      }
      route.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 5_000 });
    } catch {
      // segue
    }

    const result = await extractAdCount(page);
    return result.count;
  } catch {
    return null;
  } finally {
    await context.close().catch(() => {});
  }
}
