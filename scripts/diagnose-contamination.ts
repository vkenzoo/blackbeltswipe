/**
 * Diagnostica e limpa contaminação de criativos.
 *
 * Fluxo:
 *   1. Lista ofertas com múltiplas ad_library pages (suspeita alta)
 *   2. Lista pages criadas nas últimas 72h via auto-discovery
 *   3. Lista creatives órfãos — ligados a ofertas via meta_page_id que
 *      aparece em múltiplas ofertas (sinal de contaminação cross-offer)
 *   4. Modo --fix: move pages suspeitas pra verified_for_sync=false
 *      e DELETA creatives vinculados a elas via meta_page_id
 *
 * Uso:
 *   bun --env-file=.env.local run scripts/diagnose-contamination.ts
 *   bun --env-file=.env.local run scripts/diagnose-contamination.ts --fix
 *
 * DRY-RUN por padrão. Sempre roda sem --fix primeiro pra ver o que seria
 * afetado.
 */

import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("❌ Faltou NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false },
});

const FIX = process.argv.includes("--fix");
const CUTOFF_HOURS = 72;

async function main() {
  console.log(
    `\n🔍 Diagnóstico de contaminação · modo=${FIX ? "FIX (vai alterar dados!)" : "dry-run"}\n`
  );

  // ─────────────────────────────────────────────────────────
  // 1. Ofertas com múltiplas ad_library pages
  // ─────────────────────────────────────────────────────────
  console.log("── 1. Ofertas com múltiplas ad_library pages ──");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allPages } = (await (supa as any)
    .from("pages")
    .select("offer_id, meta_page_id, title, created_at, verified_for_sync, discovered_via")
    .eq("type", "ad_library")
    .not("meta_page_id", "is", null)) as {
    data: Array<{
      offer_id: string;
      meta_page_id: string;
      title: string | null;
      created_at: string;
      verified_for_sync?: boolean;
      discovered_via?: string;
    }> | null;
  };

  if (!allPages || allPages.length === 0) {
    console.log("  (nenhuma ad_library page no banco)\n");
  } else {
    const byOffer = new Map<string, typeof allPages>();
    for (const p of allPages) {
      if (!byOffer.has(p.offer_id)) byOffer.set(p.offer_id, []);
      byOffer.get(p.offer_id)!.push(p);
    }
    const suspicious = [...byOffer.entries()].filter(([, ps]) => ps.length > 1);

    if (suspicious.length === 0) {
      console.log("  (nenhuma oferta com >1 ad_library — OK)\n");
    } else {
      // Fetch slugs
      const offerIds = suspicious.map(([id]) => id);
      const { data: offers } = await supa
        .from("offers")
        .select("id, slug, title")
        .in("id", offerIds)
        .returns<{ id: string; slug: string; title: string }[]>();
      const slugMap = new Map((offers ?? []).map((o) => [o.id, o]));

      for (const [offerId, pages] of suspicious) {
        const offer = slugMap.get(offerId);
        console.log(
          `  • ${offer?.slug ?? offerId.slice(0, 8)} (${pages.length} pages): "${offer?.title ?? "?"}"`
        );
        for (const p of pages) {
          const ver = p.verified_for_sync === false ? "❌ unverified" : "✓ verified";
          const via = p.discovered_via ?? "?";
          console.log(
            `      - page=${p.meta_page_id} ${ver} via=${via} @ ${p.created_at.slice(0, 16)}`
          );
        }
      }
      console.log(`  Total: ${suspicious.length} ofertas suspeitas\n`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. Pages criadas recentemente via auto-discovery
  // ─────────────────────────────────────────────────────────
  console.log(`── 2. Pages criadas nas últimas ${CUTOFF_HOURS}h via auto-discovery ──`);
  const cutoff = new Date(Date.now() - CUTOFF_HOURS * 3600_000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentAuto } = (await (supa as any)
    .from("pages")
    .select("id, offer_id, meta_page_id, title, created_at, verified_for_sync")
    .eq("type", "ad_library")
    .gte("created_at", cutoff)
    .like("title", "%descoberta via%")
    .order("created_at", { ascending: false })) as {
    data: Array<{
      id: string;
      offer_id: string;
      meta_page_id: string;
      title: string;
      created_at: string;
      verified_for_sync?: boolean;
    }> | null;
  };

  const recent = recentAuto ?? [];
  if (recent.length === 0) {
    console.log("  (nenhuma recente — OK)\n");
  } else {
    console.log(`  Encontradas: ${recent.length}`);
    for (const p of recent.slice(0, 20)) {
      const ver = p.verified_for_sync === false ? "❌" : "✓";
      console.log(
        `    ${ver} offer=${p.offer_id.slice(0, 8)} page=${p.meta_page_id} · ${p.title}`
      );
    }
    if (recent.length > 20) console.log(`    ... e +${recent.length - 20} mais`);
    console.log();
  }

  // ─────────────────────────────────────────────────────────
  // 3. Creatives órfãos (meta_page_id aparece em múltiplas ofertas)
  // ─────────────────────────────────────────────────────────
  console.log("── 3. Creatives com meta_page_id aparecendo em MÚLTIPLAS ofertas ──");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allCreatives } = (await (supa as any)
    .from("creatives")
    .select("id, offer_id, meta_page_id, meta_ad_id, created_at")
    .not("meta_page_id", "is", null)) as {
    data: Array<{
      id: string;
      offer_id: string;
      meta_page_id: string;
      meta_ad_id: string | null;
      created_at: string;
    }> | null;
  };

  const creatives = allCreatives ?? [];
  const pageIdToOffers = new Map<string, Set<string>>();
  for (const c of creatives) {
    if (!pageIdToOffers.has(c.meta_page_id))
      pageIdToOffers.set(c.meta_page_id, new Set());
    pageIdToOffers.get(c.meta_page_id)!.add(c.offer_id);
  }
  const crossOffer = [...pageIdToOffers.entries()].filter(
    ([, offers]) => offers.size > 1
  );
  if (crossOffer.length === 0) {
    console.log("  (nenhum page_id em múltiplas ofertas — OK)\n");
  } else {
    console.log(
      `  ⚠️  ${crossOffer.length} page_ids estão em múltiplas ofertas (contaminação certa!)`
    );
    for (const [pid, offers] of crossOffer.slice(0, 10)) {
      console.log(`    • page=${pid} → ${offers.size} ofertas: ${[...offers].map((o) => o.slice(0, 8)).join(", ")}`);
    }
    console.log();
  }

  // ─────────────────────────────────────────────────────────
  // 4. FIX mode
  // ─────────────────────────────────────────────────────────
  if (!FIX) {
    console.log("💡 Rode com --fix pra quarantinar pages recentes + remover creatives contaminados\n");
    return;
  }

  console.log("── 4. APLICANDO FIX ──");

  // 4a. Marca todas pages recentes auto-discovered como unverified
  if (recent.length > 0) {
    const ids = recent.map((p) => p.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e1 } = await (supa as any)
      .from("pages")
      .update({ verified_for_sync: false })
      .in("id", ids);
    console.log(
      e1
        ? `  ❌ erro quarantinando pages: ${e1.message}`
        : `  ✓ ${recent.length} pages marcadas verified_for_sync=false`
    );
  }

  // 4b. Remove creatives vinculados a page_ids em múltiplas ofertas
  // (preserva a cópia original — deleta só as duplicatas/contaminadas).
  // Regra: pro page_id em múltiplas ofertas, mantém SÓ os creatives da
  // oferta com mais VSL/coerência. Sem heurística boa aqui — por agora
  // só marca como invisíveis (visible=false) pro admin revisar manual.
  if (crossOffer.length > 0) {
    let affected = 0;
    for (const [pid, offers] of crossOffer) {
      // Mantém a 1ª oferta (menor id lexicográfico) e esconde as outras
      const sortedOffers = [...offers].sort();
      const hideInOffers = sortedOffers.slice(1);
      for (const offerId of hideInOffers) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error, count } = await (supa as any)
          .from("creatives")
          .update({ visible: false }, { count: "exact" })
          .eq("meta_page_id", pid)
          .eq("offer_id", offerId);
        if (!error) affected += count ?? 0;
      }
    }
    console.log(`  ✓ ${affected} creatives marcados visible=false (contaminados cross-offer)`);
  }

  console.log("\n✅ Fix aplicado. Abra /admin/offers e valide antes de rodar mais sync.\n");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
