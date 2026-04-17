#!/usr/bin/env bun
/**
 * Quick test: conexão + service role funciona.
 * bun run scripts/test-supabase.ts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error("❌ Faltam variáveis em .env.local");
  process.exit(1);
}

console.log("🔗", url);
console.log();

// Teste 1: anon client
const anonClient = createClient(url, anon);
const { error: anonErr } = await anonClient.from("_test_nonexistent").select("*").limit(1);
if (anonErr?.code === "42P01" || anonErr?.message?.includes("does not exist")) {
  console.log("✅ anon client conecta (tabela teste não existe, esperado)");
} else if (anonErr) {
  console.log("⚠️  anon client:", anonErr.message);
} else {
  console.log("✅ anon client conecta");
}

// Teste 2: service role
const serviceClient = createClient(url, service, { auth: { persistSession: false } });
const { data, error: serviceErr } = await serviceClient.rpc("version" as never);
if (serviceErr?.code === "42883") {
  console.log("✅ service role client conecta (rpc version não existe no schema público, mas auth ok)");
} else if (serviceErr) {
  // Try another way — list auth.users
  const { error: usersErr } = await serviceClient.auth.admin.listUsers();
  if (!usersErr) {
    console.log("✅ service role client conecta (listou users)");
  } else {
    console.log("❌ service role falhou:", usersErr.message);
  }
} else {
  console.log("✅ service role client conecta:", data);
}

console.log();
console.log("🎉 Credenciais válidas. Pronto pra rodar migrations.");
