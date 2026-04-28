/**
 * GET /api/cron/daily-ad-count
 *
 * Chamado diariamente pelo Vercel Cron (configurado em vercel.json).
 * Enfileira `refresh_ad_count` pra todas offers active+paused.
 *
 * Safety net independente do `dailyRefreshSweep` do worker (que depende
 * do processo worker estar rodando). Se o worker cair, Vercel Cron continua
 * enfileirando — quando worker voltar, processa backlog.
 *
 * Auth: header `Authorization: Bearer <CRON_SECRET>` — só Vercel Cron tem
 * esse valor. Em dev pode chamar via curl com o secret também.
 *
 * Dedup: se já tem refresh_ad_count pending/running pra uma oferta, pula.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron envia Authorization: Bearer <CRON_SECRET>
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:daily-ad-count] CRON_SECRET não configurado");
    return NextResponse.json(
      { error: "cron_secret_not_configured" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supa = createServiceClient();

  // Busca todas active + paused (paused continua sendo espionada pra detectar ressurreição)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offersData } = await (supa as any)
    .from("offers")
    .select("id")
    .in("status", ["active", "paused"]);

  const offers: Array<{ id: string }> = offersData ?? [];

  if (offers.length === 0) {
    return NextResponse.json({
      ok: true,
      enqueued: 0,
      total_offers: 0,
      message: "no_active_offers",
    });
  }

  // Dedup contra jobs pending/running existentes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supa as any)
    .from("jobs")
    .select("payload, status")
    .eq("kind", "refresh_ad_count")
    .in("status", ["pending", "running"]);

  const already = new Set<string>();
  for (const j of (existing ?? []) as Array<{
    payload: { offer_id?: string };
  }>) {
    const oid = j.payload?.offer_id;
    if (typeof oid === "string") already.add(oid);
  }

  const toEnqueue = offers.filter((o) => !already.has(o.id));

  if (toEnqueue.length === 0) {
    return NextResponse.json({
      ok: true,
      enqueued: 0,
      total_offers: offers.length,
      skipped: offers.length,
      message: "all_already_enqueued",
    });
  }

  const rows = toEnqueue.map((o) => ({
    kind: "refresh_ad_count",
    payload: { offer_id: o.id, source: "cron_daily" },
    status: "pending",
    priority: 60, // menor que refresh manual (85) mas maior que bulk (50)
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insErr } = await (supa.from("jobs") as any).insert(rows);
  if (insErr) {
    console.error(
      "[cron:daily-ad-count] insert jobs error:",
      insErr.message
    );
    return NextResponse.json(
      { error: "insert_failed", message: insErr.message },
      { status: 500 }
    );
  }

  console.log(
    `[cron:daily-ad-count] enfileirado refresh_ad_count pra ${toEnqueue.length} ofertas (${offers.length - toEnqueue.length} já estavam na fila)`
  );

  return NextResponse.json({
    ok: true,
    enqueued: toEnqueue.length,
    total_offers: offers.length,
    skipped: offers.length - toEnqueue.length,
    timestamp: new Date().toISOString(),
  });
}
