/**
 * POST /api/admin/offers/[id]/ai-authoring/accept
 *
 * Body: { fields: string[] } — lista de campos do ai_draft a aceitar.
 *   Campos possíveis: "suggested_title" | "structure" | "traffic_source" | "ai_summary"
 *
 * Copia os valores do ai_draft pros campos reais da oferta.
 * Acumula em ai_accepted_fields pra audit trail.
 * Seta ai_accepted_at se ainda não foi setado.
 *
 * Se o array é vazio, retorna 400 (usa POST discard pra "aceitar nenhum").
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { AiDraft } from "@/lib/types";

const FIELD_TO_COLUMN: Record<string, string> = {
  suggested_title: "title",
  structure: "structure",
  traffic_source: "traffic_source",
  ai_summary: "ai_summary",
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await ctx.params;

  let body: { fields?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const fields = Array.isArray(body.fields) ? body.fields : [];
  if (fields.length === 0) {
    return NextResponse.json(
      { error: "no_fields_specified" },
      { status: 400 }
    );
  }

  const supa = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offerRaw } = await (supa as any)
    .from("offers")
    .select("id, ai_draft, ai_accepted_fields")
    .eq("id", id)
    .maybeSingle();

  const offer = offerRaw as
    | { id: string; ai_draft: AiDraft | null; ai_accepted_fields: string[] | null }
    | null;

  if (!offer) {
    return NextResponse.json({ error: "offer_not_found" }, { status: 404 });
  }

  if (!offer.ai_draft) {
    return NextResponse.json({ error: "no_ai_draft" }, { status: 400 });
  }

  const draft = offer.ai_draft;
  const patch: Record<string, unknown> = {};

  for (const field of fields) {
    const column = FIELD_TO_COLUMN[field];
    if (!column) continue;
    const value = (draft as Record<string, unknown>)[field];
    if (value !== undefined && value !== null && value !== "") {
      patch[column] = value;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "nothing_to_apply", message: "Campos selecionados estão vazios no draft" },
      { status: 400 }
    );
  }

  // Merge aceitos com os já existentes
  const acceptedSet = new Set([
    ...(offer.ai_accepted_fields ?? []),
    ...fields,
  ]);

  patch.ai_accepted_at = new Date().toISOString();
  patch.ai_accepted_fields = [...acceptedSet];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (supa as any)
    .from("offers")
    .update(patch)
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    applied_fields: fields,
    total_accepted: [...acceptedSet],
  });
}
