#!/usr/bin/env bun
/**
 * Seed: popula 20 ofertas reais no DB (mesmas do mock).
 *
 * Uso:
 *   bun --env-file=.env.local run scripts/seed-offers.ts
 *
 * Idempotente: se oferta já existe (por slug), faz update.
 */

import { createClient } from "@supabase/supabase-js";
import { MOCK_OFFERS } from "../lib/mock/offers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !service) {
  console.error("❌ Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const supa = createClient(url, service, { auth: { persistSession: false } });

console.log(`🌱 Seeding ${MOCK_OFFERS.length} ofertas...\n`);

let ok = 0;
let fail = 0;

for (const offer of MOCK_OFFERS) {
  const payload = {
    slug: offer.slug,
    title: offer.title,
    niche: offer.niche,
    language: offer.language,
    structure: offer.structure,
    traffic_source: offer.traffic_source,
    status: offer.status,
    ad_count: offer.ad_count,
    launched_at: offer.launched_at,
    thumb_gradient: offer.thumb_gradient,
    transcript_preview: offer.transcript_preview ?? null,
    vsl_duration_seconds: offer.vsl_duration_seconds ?? null,
    flags: offer.flags ?? [],
  };

  const { error } = await supa.from("offers").upsert(payload, { onConflict: "slug" });

  if (error) {
    console.log(`  ❌ ${offer.slug.padEnd(35)} ${error.message}`);
    fail++;
  } else {
    console.log(`  ✅ ${offer.slug.padEnd(35)} ${offer.title}`);
    ok++;
  }
}

console.log();
console.log(`🎉 ${ok}/${MOCK_OFFERS.length} ofertas seed. ${fail > 0 ? `⚠️  ${fail} falharam.` : ""}`);

// Verificação final
const { count } = await supa.from("offers").select("*", { count: "exact", head: true });
console.log(`📊 Total no DB: ${count} ofertas.`);
