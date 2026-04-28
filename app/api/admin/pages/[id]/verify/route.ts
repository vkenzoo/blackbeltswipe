/**
 * POST /api/admin/pages/[id]/verify
 * Body: { verified: boolean }
 *
 * Admin aprova (verified=true) ou rejeita (false) uma page ad_library
 * descoberta via auto-discovery. Pages unverified não alimentam o
 * sync-creatives, evitando contaminação de criativos.
 *
 * Quando admin aprova, opcionalmente enfileira sync-creatives pra pegar
 * os ads daquela page.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await ctx.params;

  let body: { verified?: boolean; enqueue_sync?: boolean } = {};
  try {
    body = await req.json();
  } catch {}

  if (typeof body.verified !== "boolean") {
    return NextResponse.json(
      { error: "missing_or_invalid_verified_field" },
      { status: 400 }
    );
  }

  const supa = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: page, error: pErr } = await (supa as any)
    .from("pages")
    .select("id, offer_id, type, meta_page_id")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      offer_id: string;
      type: string;
      meta_page_id: string | null;
    }>();

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  if (!page) {
    return NextResponse.json({ error: "page_not_found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (supa as any)
    .from("pages")
    .update({ verified_for_sync: body.verified })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Se aprovou e pediu sync, enfileira job imediato
  if (body.verified && body.enqueue_sync && page.type === "ad_library") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa.from("jobs") as any).insert({
      kind: "sync_creatives",
      payload: { offer_id: page.offer_id },
      status: "pending",
      priority: 80,
    });
  }

  return NextResponse.json({ ok: true, page_id: id, verified: body.verified });
}
