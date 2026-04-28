import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { computeScaleScore, type Snapshot } from "@/lib/worker/scale-score";

type Supa = SupabaseClient<Database>;

/**
 * Handler: compute_scale_score
 *
 * Payload: { offer_id: string }
 *
 * Fluxo:
 *   1. Busca últimos 30 snapshots de offer_metrics (janela de score)
 *   2. Busca offer.created_at (pro longevity factor)
 *   3. Chama computeScaleScore (pure fn)
 *   4. Update offers: scale_score, scale_trend, scale_velocity,
 *      consecutive_zero_days, refresh_interval_hours (tiered)
 *   5. Auto-status: se consecutive_zero_days >= 3 → paused
 *                   se ressuscitou (was paused, agora has ads) → active + alert
 *   6. Enqueue dispatch_alert se mudança de status ou score_drop
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleComputeScaleScore(supa: Supa, payload: any): Promise<void> {
  const { offer_id } = payload as { offer_id: string };
  if (!offer_id) throw new Error("missing_offer_id");

  // 1. Busca offer current state — cast any por campos novos (scale_*, auto_paused_at etc)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offer } = await (supa as any)
    .from("offers")
    .select(
      "id, created_at, status, scale_score, scale_trend, ad_count, auto_paused_at, consecutive_zero_days"
    )
    .eq("id", offer_id)
    .maybeSingle<{
      id: string;
      created_at: string;
      status: string;
      scale_score: number | null;
      scale_trend: string | null;
      ad_count: number | null;
      auto_paused_at: string | null;
      consecutive_zero_days: number | null;
    }>();

  if (!offer) throw new Error("offer_not_found");

  // 2. Busca últimos 30 snapshots — cast any porque creative_count é coluna nova
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snaps } = await (supa as any)
    .from("offer_metrics")
    .select("sampled_at, ad_count, creative_count")
    .eq("offer_id", offer_id)
    .order("sampled_at", { ascending: false })
    .limit(30)
    .returns<Snapshot[]>();

  const snapshots = (snaps ?? []).reverse(); // ascending

  // 3. Compute score
  const result = computeScaleScore(snapshots, offer.created_at);

  // 4. Decide refresh_interval_hours (tiered frequency)
  const refresh_interval_hours =
    result.score >= 80
      ? 6 // hot
      : result.score >= 40
      ? 24 // steady
      : result.consecutive_zero_days >= 14
      ? 24 * 30 // dead → checa só mensal
      : 24 * 7; // cold → semanal

  // 5. Auto-status logic
  const prevStatus = offer.status;
  let nextStatus = prevStatus;
  let auto_paused_at: string | null | undefined = undefined; // undefined = don't touch

  const nowIso = new Date().toISOString();

  const shouldAutoPause =
    prevStatus === "active" && result.consecutive_zero_days >= 3;
  const shouldRevive =
    prevStatus === "paused" &&
    offer.auto_paused_at !== null && // só ofertas auto-pausadas
    (offer.ad_count ?? 0) > 0;

  if (shouldAutoPause) {
    nextStatus = "paused";
    auto_paused_at = nowIso;
  } else if (shouldRevive) {
    nextStatus = "active";
    auto_paused_at = null;
  }

  // 6. Update offer
  const update: Record<string, unknown> = {
    scale_score: result.score,
    scale_trend: result.trend,
    scale_velocity: result.velocity,
    consecutive_zero_days: result.consecutive_zero_days,
    refresh_interval_hours,
  };
  if (nextStatus !== prevStatus) {
    update.status = nextStatus;
  }
  if (auto_paused_at !== undefined) {
    update.auto_paused_at = auto_paused_at;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa.from("offers") as any).update(update).eq("id", offer_id);

  console.log(
    `[compute_scale_score] offer ${offer_id.slice(0, 8)} · score=${result.score} trend=${result.trend} velocity=${result.velocity}% zeros=${result.consecutive_zero_days}` +
      (nextStatus !== prevStatus ? ` · STATUS: ${prevStatus} → ${nextStatus}` : "")
  );

  // 7. Dispatch alerts se houve mudança relevante
  if (nextStatus !== prevStatus) {
    await dispatchAlertsForStatusChange(supa, offer_id, prevStatus, nextStatus);
  }

  // Alert extra: score caiu 20+ pontos vs anterior (recomputed)
  if (
    offer.scale_score !== null &&
    offer.scale_score !== undefined &&
    offer.scale_score - result.score >= 20
  ) {
    await dispatchAlertsForScoreDrop(
      supa,
      offer_id,
      offer.scale_score,
      result.score
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Alerts dispatch (in-app v1)
// ─────────────────────────────────────────────────────────────

async function dispatchAlertsForStatusChange(
  supa: Supa,
  offer_id: string,
  fromStatus: string,
  toStatus: string
): Promise<void> {
  // Busca subscribers — cast any porque tables novas, regerar types depois da migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subs } = await (supa as any)
    .from("alert_subscriptions")
    .select("id, user_id, alert_on")
    .eq("offer_id", offer_id)
    .returns<{ id: string; user_id: string; alert_on: string[] }[]>();

  if (!subs?.length) return;

  const kind = toStatus === "active" && fromStatus === "paused" ? "revived" : "status_change";
  const targetAlertOn = "status_change"; // ambos (revived, status_change) caem aqui

  const rows = subs
    .filter((s: { alert_on: string[] }) => (s.alert_on ?? []).includes(targetAlertOn))
    .map((s: { id: string; user_id: string }) => ({
      subscription_id: s.id,
      user_id: s.user_id,
      offer_id,
      kind,
      payload: { from: fromStatus, to: toStatus },
      delivered_via: "in_app",
    }));

  if (rows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa as any).from("alerts_log").insert(rows);
  }
}

async function dispatchAlertsForScoreDrop(
  supa: Supa,
  offer_id: string,
  fromScore: number,
  toScore: number
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subs } = await (supa as any)
    .from("alert_subscriptions")
    .select("id, user_id, alert_on")
    .eq("offer_id", offer_id)
    .returns<{ id: string; user_id: string; alert_on: string[] }[]>();

  if (!subs?.length) return;

  const rows = subs
    .filter((s: { alert_on: string[] }) => (s.alert_on ?? []).includes("score_drop_20"))
    .map((s: { id: string; user_id: string }) => ({
      subscription_id: s.id,
      user_id: s.user_id,
      offer_id,
      kind: "score_drop_20",
      payload: { from: fromScore, to: toScore, delta: fromScore - toScore },
      delivered_via: "in_app",
    }));

  if (rows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supa as any).from("alerts_log").insert(rows);
  }
}
