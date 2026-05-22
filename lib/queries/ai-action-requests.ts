/**
 * Queries pra fila de aprovação de ações de IA.
 *
 * Usado por:
 *   - /admin/aprovacoes (lista pending agrupado por oferta)
 *   - /api/admin/ai-actions/[id]/approve|reject (mutations)
 */

import { createServiceClient } from "@/lib/supabase/server";

export type AiActionRequest = {
  id: string;
  action_type: "transcribe_creative" | "transcribe_vsl" | "ai_authoring";
  offer_id: string;
  target_id: string | null;
  payload: Record<string, unknown>;
  cost_estimate_usd: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: Record<string, any>;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  job_id: string | null;
  rejection_reason: string | null;
};

export type AiActionRequestWithOffer = AiActionRequest & {
  offer: {
    id: string;
    slug: string;
    title: string;
    ad_count: number;
  };
};

export type PendingAiActionsGrouped = {
  offer_id: string;
  offer_slug: string;
  offer_title: string;
  offer_ad_count: number;
  total_cost_usd: number;
  requests: AiActionRequest[];
};

/**
 * Lista TODAS as pending ai_action_requests agrupadas por oferta.
 * Ordenado por created_at DESC dentro de cada grupo.
 */
export async function listPendingAiActions(): Promise<PendingAiActionsGrouped[]> {
  const supa = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supa as any)
    .from("ai_action_requests")
    .select(`
      id,
      action_type,
      offer_id,
      target_id,
      payload,
      cost_estimate_usd,
      context,
      status,
      created_at,
      decided_at,
      decided_by,
      job_id,
      rejection_reason,
      offer:offers!ai_action_requests_offer_id_fkey (
        id,
        slug,
        title,
        ad_count
      )
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listPendingAiActions]", error);
    return [];
  }

  // Agrupar por offer_id
  const groups = new Map<string, PendingAiActionsGrouped>();
  for (const row of (data ?? []) as AiActionRequestWithOffer[]) {
    if (!row.offer) continue;
    let g = groups.get(row.offer.id);
    if (!g) {
      g = {
        offer_id: row.offer.id,
        offer_slug: row.offer.slug,
        offer_title: row.offer.title,
        offer_ad_count: row.offer.ad_count ?? 0,
        total_cost_usd: 0,
        requests: [],
      };
      groups.set(row.offer.id, g);
    }
    g.total_cost_usd += Number(row.cost_estimate_usd ?? 0);
    g.requests.push({
      id: row.id,
      action_type: row.action_type,
      offer_id: row.offer_id,
      target_id: row.target_id,
      payload: row.payload,
      cost_estimate_usd: Number(row.cost_estimate_usd ?? 0),
      context: row.context ?? {},
      status: row.status,
      created_at: row.created_at,
      decided_at: row.decided_at,
      decided_by: row.decided_by,
      job_id: row.job_id,
      rejection_reason: row.rejection_reason,
    });
  }

  // Sort grupos por total_cost desc (mais caro primeiro)
  return Array.from(groups.values()).sort(
    (a, b) => b.total_cost_usd - a.total_cost_usd
  );
}

/**
 * Soma o custo total de todas as pending (cards header).
 */
export async function getPendingAiActionsTotalCost(): Promise<{
  count: number;
  totalUsd: number;
  byType: Record<string, { count: number; totalUsd: number }>;
}> {
  const supa = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supa as any)
    .from("ai_action_requests")
    .select("action_type, cost_estimate_usd")
    .eq("status", "pending");

  const byType: Record<string, { count: number; totalUsd: number }> = {};
  let totalUsd = 0;
  for (const row of (data ?? []) as Array<{
    action_type: string;
    cost_estimate_usd: number;
  }>) {
    const cost = Number(row.cost_estimate_usd ?? 0);
    totalUsd += cost;
    if (!byType[row.action_type]) {
      byType[row.action_type] = { count: 0, totalUsd: 0 };
    }
    byType[row.action_type].count++;
    byType[row.action_type].totalUsd += cost;
  }
  return { count: (data ?? []).length, totalUsd, byType };
}

/**
 * Estatísticas histórico (aprovadas + rejeitadas últimos 30d) — usado em
 * card "histórico AI" na aba aprovacoes.
 */
export async function getAiActionsHistory(): Promise<{
  approved_30d: number;
  rejected_30d: number;
  total_spent_usd_30d: number;
}> {
  const supa = createServiceClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supa as any)
    .from("ai_action_requests")
    .select("status, cost_estimate_usd")
    .gte("decided_at", since)
    .in("status", ["approved", "rejected"]);

  let approved = 0,
    rejected = 0,
    spent = 0;
  for (const row of (data ?? []) as Array<{
    status: string;
    cost_estimate_usd: number;
  }>) {
    if (row.status === "approved") {
      approved++;
      spent += Number(row.cost_estimate_usd ?? 0);
    } else {
      rejected++;
    }
  }
  return { approved_30d: approved, rejected_30d: rejected, total_spent_usd_30d: spent };
}
