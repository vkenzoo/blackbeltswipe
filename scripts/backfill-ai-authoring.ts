/**
 * Backfill AI authoring — gera sugestões via GPT-4o-mini pra todas as
 * ofertas que já têm transcript mas ainda não têm ai_draft.
 *
 * Idempotente: pula ofertas que já têm ai_draft preenchido.
 *
 * Uso:
 *   bun --env-file=.env.local run scripts/backfill-ai-authoring.ts
 *   bun --env-file=.env.local run scripts/backfill-ai-authoring.ts --slug nathalia-beauty
 *
 * NADA nas ofertas é alterado diretamente — só popula `ai_draft` pra admin
 * revisar em /admin/offers/[id]/edit. Segurança total.
 */

import { createClient } from "@supabase/supabase-js";
import { generateAuthoring } from "@/lib/worker/ai-authoring";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("❌ SUPA envs faltando");
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY faltando");
  process.exit(1);
}

const supa = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false },
});

// Args
const slugArg = process.argv.indexOf("--slug");
const targetSlug = slugArg >= 0 ? process.argv[slugArg + 1] : null;

async function main() {
  console.log("\n🧠 Backfill AI Authoring — GPT-4o-mini vision\n");

  // 1. Busca ofertas elegíveis
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supa as any)
    .from("offers")
    .select("id, slug, title, transcript_text")
    .not("transcript_text", "is", null)
    .is("ai_draft", null);

  if (targetSlug) q = q.eq("slug", targetSlug);

  const { data: offers, error } = await q;
  if (error) {
    console.error("❌ query fail:", error.message);
    process.exit(1);
  }

  const list = (offers ?? []) as Array<{
    id: string;
    slug: string;
    title: string;
    transcript_text: string | null;
  }>;

  console.log(`📊 ${list.length} oferta${list.length === 1 ? "" : "s"} pra processar\n`);
  if (list.length === 0) {
    console.log("(nada a fazer — todas já têm ai_draft ou não têm transcript)");
    return;
  }

  let success = 0;
  let failed = 0;
  let totalTokensPrompt = 0;
  let totalTokensCompletion = 0;

  for (const offer of list) {
    const txLen = offer.transcript_text?.length ?? 0;
    process.stdout.write(
      `  • ${offer.slug.padEnd(35)} (${txLen} chars) ... `
    );

    const result = await generateAuthoring(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supa as any,
      offer.id
    );

    if (!result.ok) {
      failed++;
      console.log(`❌ ${result.error}`);
      continue;
    }

    // Salva no banco
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (supa as any)
      .from("offers")
      .update({
        ai_draft: result.draft,
        ai_generated_at: new Date().toISOString(),
        ai_accepted_at: null,
        ai_discarded_at: null,
      })
      .eq("id", offer.id);

    if (upErr) {
      failed++;
      console.log(`❌ db_fail: ${upErr.message}`);
      continue;
    }

    success++;
    const tk = result.draft.tokens_used;
    if (tk) {
      totalTokensPrompt += tk.prompt;
      totalTokensCompletion += tk.completion;
    }
    const fields = Object.keys(result.draft).filter(
      (k) => k !== "tokens_used" && k !== "model"
    );
    console.log(
      `✓ ${fields.length} campos${tk ? ` · ${tk.prompt}+${tk.completion}t` : ""}`
    );
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ ${success} sucesso · ${failed} falha`);

  // Custo GPT-4o-mini: $0.150/1M input, $0.600/1M output
  const costUsd =
    (totalTokensPrompt / 1_000_000) * 0.15 +
    (totalTokensCompletion / 1_000_000) * 0.6;
  console.log(
    `💰 Tokens: ${totalTokensPrompt} input + ${totalTokensCompletion} output ≈ $${costUsd.toFixed(4)}`
  );

  console.log("\n📝 Próximo: abre /admin/aprovacoes ou /admin/offers/[slug]/edit pra revisar.\n");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
