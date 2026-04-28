/**
 * POST /api/admin/ad-count/backfill
 *
 * Enfileira `backfill_ad_count` pra 1 ou N offers.
 * Body: { offer_ids: string[] }  OU  { scope: "all_active" | "no_history" }
 *
 * - scope "no_history": só offers sem snapshots (ou com poucos) — recomendado
 *   pra primeiro run (não reprocessa offers já com histórico ao-vivo bom).
 * - scope "all_active": força backfill em todas active (custoso em API calls).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await requireAdmin();

  let body: { offer_ids?: string[]; scope?: string; days?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const days = Math.min(90, Math.max(7, body.days ?? 30));
  const supa = createServiceClient();

  let offerIds: string[] = [];

  if (Array.isArray(body.offer_ids) && body.offer_ids.length > 0) {
    offerIds = body.offer_ids.filter(
      (id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)
    );
  } else if (body.scope === "all_active") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supa as any)
      .from("offers")
      .select("id")
      .eq("status", "active");
    const rows: Array<{ id: string }> = data ?? [];
    offerIds = rows.map((r) => r.id);
  } else if (body.scope === "no_history") {
    // Offers com <3 snapshots em `offer_metrics` → precisam de backfill
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: offers } = await (supa as any)
      .from("offers")
      .select("id")
      .eq("status", "active");
    const rows: Array<{ id: string }> = offers ?? [];

    if (rows.length === 0) {
      return NextResponse.json({ enqueued: 0, skipped: 0 });
    }

    const offerIdsList = rows.map((r) => r.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: snaps } = await (supa as any)
      .from("offer_metrics")
      .select("offer_id")
      .eq("time_window", "snapshot_1d")
      .in("offer_id", offerIdsList);

    const snapCounts = new Map<string, number>();
    for (const s of (snaps ?? []) as Array<{ offer_id: string }>) {
      snapCounts.set(s.offer_id, (snapCounts.get(s.offer_id) ?? 0) + 1);
    }

    offerIds = offerIdsList.filter((id) => (snapCounts.get(id) ?? 0) < 3);
  } else {
    return NextResponse.json(
      { error: "missing_offer_ids_or_scope" },
      { status: 400 }
    );
  }

  if (offerIds.length === 0) {
    return NextResponse.json({
      enqueued: 0,
      skipped: 0,
      message: "no_offers_to_backfill",
    });
  }

  // Dedup contra jobs pending/running existentes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supa as any)
    .from("jobs")
    .select("payload, status")
    .eq("kind", "backfill_ad_count")
    .in("status", ["pending", "running"]);

  const already = new Set<string>();
  for (const j of (existing ?? []) as Array<{
    payload: { offer_id?: string };
  }>) {
    const oid = j.payload?.offer_id;
    if (typeof oid === "string") already.add(oid);
  }

  const toEnqueue = offerIds.filter((id) => !already.has(id));

  if (toEnqueue.length === 0) {
    return NextResponse.json({
      enqueued: 0,
      skipped: offerIds.length,
      message: "all_already_enqueued",
    });
  }

  const rows = toEnqueue.map((offer_id) => ({
    kind: "backfill_ad_count",
    payload: { offer_id, days, source: "admin_backfill" },
    status: "pending",
    priority: 50, // menor que refresh (85) — backfill não é urgente
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await (supa.from("jobs") as any).insert(rows);
  if (insErr) {
    return NextResponse.json(
      { error: "insert_jobs_failed", message: insErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    enqueued: toEnqueue.length,
    skipped: offerIds.length - toEnqueue.length,
    days,
  });
}
