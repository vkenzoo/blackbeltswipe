#!/usr/bin/env bun
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supa = createClient(url, service, { auth: { persistSession: false } });

const expectedTables = [
  "profiles",
  "offers",
  "pages",
  "creatives",
  "offer_metrics",
  "favorites",
  "jobs",
];

console.log("🔍 Verificando tabelas...\n");
let allOk = true;
for (const t of expectedTables) {
  const { error, count } = await supa
    .from(t)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.log(`  ❌ ${t.padEnd(15)} — ${error.message}`);
    allOk = false;
  } else {
    console.log(`  ✅ ${t.padEnd(15)} ${count ?? 0} rows`);
  }
}

console.log("\n🗃️  Verificando buckets...\n");
const { data: buckets, error: bErr } = await supa.storage.listBuckets();
if (bErr) {
  console.log(`  ❌ ${bErr.message}`);
  allOk = false;
} else {
  const expected = ["vsls", "thumbs", "screenshots"];
  for (const id of expected) {
    const b = buckets?.find((x) => x.id === id);
    if (b) console.log(`  ✅ ${id.padEnd(15)} public=${b.public}`);
    else {
      console.log(`  ❌ ${id} NOT FOUND`);
      allOk = false;
    }
  }
}

console.log();
console.log(allOk ? "🎉 Schema completo. Pronto pra auth." : "⚠️  Tem algo faltando.");
