#!/usr/bin/env bun
/**
 * apply-migration.ts
 *
 * Aplica uma migration SQL diretamente no Postgres do Supabase.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." bun run scripts/apply-migration.ts \
 *     supabase/migrations/20260419000001_spy_engine.sql
 *
 * Ou, se o DATABASE_URL tá no .env.local:
 *   bun --env-file=.env.local run scripts/apply-migration.ts <path>
 *
 * Se não passar caminho, aplica a MIGRATION MAIS RECENTE por nome (ordem alfa).
 */

import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ Falta env var DATABASE_URL");
  console.error("   Pega em: Supabase Dashboard → Project Settings → Database");
  console.error("   → Connection string → URI (com password)");
  console.error("   Rode: DATABASE_URL=\"postgresql://...\" bun run scripts/apply-migration.ts");
  process.exit(1);
}

// Descobre qual migration rodar
let migrationPath = process.argv[2];
if (!migrationPath) {
  // Pega a mais recente no diretório supabase/migrations/
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // ordem alfa = ordem cronológica (prefixo timestamp)
  if (files.length === 0) {
    console.error(`❌ Nenhum .sql em ${dir}`);
    process.exit(1);
  }
  migrationPath = join(dir, files[files.length - 1]);
  console.log(`📄 Aplicando migration mais recente: ${files[files.length - 1]}`);
}

// Lê o SQL
let sql: string;
try {
  sql = readFileSync(migrationPath, "utf-8");
} catch (err) {
  console.error(`❌ Não consegui ler ${migrationPath}:`, (err as Error).message);
  process.exit(1);
}

console.log(`📏 Tamanho: ${sql.length} chars`);

// Conecta e executa
const client = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 5,
  // Supabase precisa SSL
  ssl: "require",
});

try {
  console.log("🔌 Conectando ao Postgres...");
  // Testa conexão
  const [{ version }] = await client`SELECT version() as version`;
  console.log(`✅ Conectado: ${version.slice(0, 60)}...`);

  console.log("🚀 Executando migration...");
  const t0 = Date.now();
  await client.unsafe(sql);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✅ Migration aplicada em ${elapsed}s`);

  // Verifica
  console.log("\n🔍 Verificando schema...");
  const scaleCols = await client<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name LIKE 'scale_%'
    ORDER BY column_name
  `;
  console.log(`  • offers.scale_* columns: ${scaleCols.map((c) => c.column_name).join(", ") || "NENHUMA"}`);

  const newTables = await client<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('alert_subscriptions', 'alerts_log')
    ORDER BY table_name
  `;
  console.log(`  • novas tables: ${newTables.map((t) => t.table_name).join(", ") || "NENHUMA"}`);

  const offersCount = await client<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM offers`;
  console.log(`  • offers no banco: ${offersCount[0].c}`);

  console.log("\n🎉 Tudo certo! Pode reiniciar o worker agora.");
} catch (err) {
  console.error("\n❌ Erro:", (err as Error).message);
  console.error("\nSe for erro tipo 'column already exists' ou 'relation already exists',");
  console.error("a migration já rodou antes — pode ignorar.");
  process.exit(1);
} finally {
  await client.end();
}
