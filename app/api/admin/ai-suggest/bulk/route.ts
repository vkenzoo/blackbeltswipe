/**
 * POST /api/admin/ai-suggest/bulk
 *
 * Body:
 *   {
 *     action: "accept_all" | "discard" | "regenerate",
 *     offer_ids: string[],
 *     fields?: string[]  // pra accept_all — quais campos aceitar (default: todos com sugestão)
 *   }
 *
 * Aplica a ação em cada offer_id. Não dá rollback se 1 falhar — retorna
 * array de results { id, ok, error? } pra UI mostrar qual deu certo.
 *
 * PROIBIDO: este endpoint NUNCA escreve valores em title/structure/etc sem
 * antes copiar do ai_draft do próprio offer. Garantido pelo contrato:
 * action="accept_all" só copia o que tá no draft.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { AiDraft } from "@/lib/types";

const ACTION_FIELDS: Record<string, string> = {
  suggested_title: "title",
  structure: "structure",
  traffic_source: "traffic_source",
  ai_summary: "ai_summary",
};

const VALID_ACTIONS = ["accept_all", "discard", "regenerate"] as const;
type Action = (typeof VALID_ACTIONS)[number];

export async function POST(req: Request) {
  await requireAdmin();

  let body: {
    action?: string;
    offer_ids?: unknown;
    fields?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action = body.action as Action | undefined;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "invalid_action", valid: VALID_ACTIONS },
      { status: 400 }
    );
  }

  const offerIds = Array.isArray(body.offer_ids)
    ? body.offer_ids.filter((x): x is string => typeof x === "string")
    : [];

  if (offerIds.length === 0) {
    return NextResponse.json(
      { error: "no_offer_ids_provided" },
      { status: 400 }
    );
  }
  if (offerIds.length > 200) {
    return NextResponse.json(
      { error: "too_many_ids", max: 200 },
      { status: 400 }
    );
  }

  const allowedFields = Array.isArray(body.fields)
    ? body.fields.filter(
        (f): f is string => typeof f === "string" && f in ACTION_FIELDS
      )
    : null;

  const supa = createServiceClient();
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  // ── accept_all: pra cada oferta, copia campos do draft pros reais ──
  if (action === "accept_all") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: offers } = await (supa as any)
      .from("offers")
      .select("id, ai_draft, ai_accepted_fields")
      .in("id", offerIds);

    const list = (offers ?? []) as Array<{
      id: string;
      ai_draft: AiDraft | null;
      ai_accepted_fields: string[] | null;
    }>;

    for (const offer of list) {
      if (!offer.ai_draft) {
        results.push({ id: offer.id, ok: false, error: "no_draft" });
        continue;
      }

      const draft = offer.ai_draft;
      const patch: Record<string, unknown> = {};
      const appliedFields: string[] = [];

      for (const [draftKey, columnKey] of Object.entries(ACTION_FIELDS)) {
        if (allowedFields && !allowedFields.includes(draftKey)) continue;
        const value = (draft as Record<string, unknown>)[draftKey];
        if (value !== undefined && value !== null && value !== "") {
          patch[columnKey] = value;
          appliedFields.push(draftKey);
        }
      }

      if (appliedFields.length === 0) {
        results.push({ id: offer.id, ok: false, error: "empty_draft" });
        continue;
      }

      const acceptedSet = new Set([
        ...(offer.ai_accepted_fields ?? []),
        ...appliedFields,
      ]);
      patch.ai_accepted_at = new Date().toISOString();
      patch.ai_accepted_fields = [...acceptedSet];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upErr } = await (supa as any)
        .from("offers")
        .update(patch)
        .eq("id", offer.id);

      if (upErr) {
        results.push({ id: offer.id, ok: false, error: upErr.message });
      } else {
        results.push({ id: offer.id, ok: true });
      }
    }
  }

  // ── discard: marca ai_discarded_at em todas ──
  if (action === "discard") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supa as any)
      .from("offers")
      .update({ ai_discarded_at: new Date().toISOString() })
      .in("id", offerIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const id of offerIds) results.push({ id, ok: true });
  }

  // ── regenerate: limpa draft + enfileira jobs ai_authoring ──
  if (action === "regenerate") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa as any)
      .from("offers")
      .update({
        ai_draft: null,
        ai_generated_at: null,
        ai_accepted_at: null,
        ai_discarded_at: null,
      })
      .in("id", offerIds);

    const jobRows = offerIds.map((id) => ({
      kind: "ai_authoring",
      payload: { offer_id: id },
      status: "pending",
      priority: 80,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supa.from("jobs") as any).insert(jobRows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const id of offerIds) results.push({ id, ok: true });
  }

  const successCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    action,
    total: offerIds.length,
    success: successCount,
    failed: offerIds.length - successCount,
    results,
  });
}
