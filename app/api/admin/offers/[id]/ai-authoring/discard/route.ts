/**
 * POST /api/admin/offers/[id]/ai-authoring/discard
 *
 * Admin clicou "Descartar sugestões". Marca ai_discarded_at e mantém o
 * ai_draft no banco pra auditoria (pode dar ctrl+z via query se foi engano).
 * Banner some pq condição do render é `!ai_accepted_at && !ai_discarded_at`.
 *
 * Nada nos campos reais é alterado.
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supa as any)
    .from("offers")
    .update({
      ai_discarded_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
