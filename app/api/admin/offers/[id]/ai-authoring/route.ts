/**
 * POST /api/admin/offers/[id]/ai-authoring
 * Re-enfileira job ai_authoring (botão "Re-gerar com IA" no banner).
 * Limpa draft antigo pra UI mostrar loading enquanto novo vem.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await ctx.params;

  const supa = createServiceClient();

  // Limpa draft antigo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (supa as any)
    .from("offers")
    .update({
      ai_draft: null,
      ai_generated_at: null,
      ai_accepted_at: null,
      ai_discarded_at: null,
    })
    .eq("id", id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Enfileira job novo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobErr } = await (supa.from("jobs") as any)
    .insert({
      kind: "ai_authoring",
      payload: { offer_id: id },
      status: "pending",
      priority: 90, // alta, admin tá esperando
    })
    .select("id")
    .single();

  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job_id: job.id });
}
