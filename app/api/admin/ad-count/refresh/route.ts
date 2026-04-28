/**
 * POST /api/admin/ad-count/refresh
 *
 * Enfileira `refresh_ad_count` pra uma ou múltiplas ofertas.
 * Body: { offer_ids: string[] }  OU  { scope: "stale" | "zero" | "all_active" }
 *
 * Usado pela página /admin/contagem-ads pra forçar refresh manual.
 * Dedupa: se já tem job pending/running pra essa oferta, não enfileira dupe.
 * Priority=85 (alta, acima dos 75 padrão) pra rodar antes de outros kinds.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/server";

const STALE_HOURS = 48;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await requireAdmin();

  let body: { offer_ids?: string[]; scope?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const supa = createServiceClient();

  // Resolve quais ofertas processar
  let offerIds: string[] = [];

  if (Array.isArray(body.offer_ids) && body.offer_ids.length > 0) {
    // Valida que são UUIDs
    offerIds = body.offer_ids.filter(
      (id) =>
        typeof id === "string" &&
        /^[0-9a-f-]{36}$/i.test(id)
    );
    if (offerIds.length === 0) {
      return NextResponse.json(
        { error: "no_valid_offer_ids" },
        { status: 400 }
      );
    }
  } else if (body.scope === "stale") {
    const staleThreshold = new Date(
      Date.now() - STALE_HOURS * 60 * 60 * 1000
    ).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supa as any)
      .from("offers")
      .select("id")
      .in("status", ["active", "paused"])
      .or(`last_refreshed_at.is.null,last_refreshed_at.lte.${staleThreshold}`);
    const rows: Array<{ id: string }> = data ?? [];
    offerIds = rows.map((r) => r.id);
  } else if (body.scope === "zero") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supa as any)
      .from("offers")
      .select("id")
      .eq("status", "active")
      .or("ad_count.eq.0,ad_count.is.null");
    const rows: Array<{ id: string }> = data ?? [];
    offerIds = rows.map((r) => r.id);
  } else if (body.scope === "all_active") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supa as any)
      .from("offers")
      .select("id")
      .eq("status", "active");
    const rows: Array<{ id: string }> = data ?? [];
    offerIds = rows.map((r) => r.id);
  } else {
    return NextResponse.json(
      { error: "missing_offer_ids_or_scope" },
      { status: 400 }
    );
  }

  if (offerIds.length === 0) {
    return NextResponse.json({ enqueued: 0, skipped: 0 });
  }

  // Dedupe: busca jobs pending/running dessas ofertas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingJobs } = await (supa as any)
    .from("jobs")
    .select("payload, status")
    .eq("kind", "refresh_ad_count")
    .in("status", ["pending", "running"]);

  const already = new Set<string>();
  for (const j of (existingJobs ?? []) as Array<{
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
      reason: "all_already_enqueued",
    });
  }

  const rows = toEnqueue.map((offer_id) => ({
    kind: "refresh_ad_count",
    payload: { offer_id, source: "admin_manual_refresh" },
    status: "pending",
    priority: 85,
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
  });
}
