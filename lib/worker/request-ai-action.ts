/**
 * request-ai-action — gate central pra todas as chamadas de IA pagas.
 *
 * Antes: pipelines (enrich, sync_creatives, sweeps) faziam INSERT direto
 * em `jobs` com kind=transcribe_creative / transcribe_vsl / ai_authoring →
 * worker pegava e gastava OpenAI/Whisper sem admin saber.
 *
 * Agora: pipelines chamam `requestAiAction()` que:
 *   1. Cria linha em ai_action_requests (status=pending)
 *   2. Admin vê em /admin/aprovacoes
 *   3. Admin aprova → API cria job real
 *   4. Admin rejeita → request descarta, job nunca roda
 *
 * Bypass: quando admin clica botão manual ("Transcrever VSL agora") na edit
 * page, a API enfileira job direto + cria request já em status=approved
 * pra ter rastreamento histórico.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Supa = SupabaseClient<Database>;

export type AiActionType =
  | "transcribe_creative"
  | "transcribe_vsl"
  | "ai_authoring";

export type RequestAiActionInput = {
  supa: Supa;
  actionType: AiActionType;
  offerId: string;
  targetId?: string | null;
  payload: Record<string, unknown>;
  costEstimateUsd: number;
  context?: Record<string, unknown>;
};

export type RequestAiActionResult =
  | { ok: true; requestId: string; deduplicated: false }
  | { ok: true; requestId: string; deduplicated: true } // já existia pending igual
  | { ok: false; error: string };

/**
 * Cria uma request de IA pendente. Idempotente via unique index
 * (offer_id, action_type, coalesce(target_id, sentinel)) WHERE status=pending
 * — re-chamar com mesmos params não duplica.
 */
export async function requestAiAction(
  input: RequestAiActionInput
): Promise<RequestAiActionResult> {
  const {
    supa,
    actionType,
    offerId,
    targetId,
    payload,
    costEstimateUsd,
    context,
  } = input;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supa.from("ai_action_requests") as any)
      .insert({
        action_type: actionType,
        offer_id: offerId,
        target_id: targetId ?? null,
        payload,
        cost_estimate_usd: costEstimateUsd,
        context: context ?? {},
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = unique violation (já tem pending igual)
      if (error.code === "23505") {
        // Busca o id existente pra retornar
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (supa as any)
          .from("ai_action_requests")
          .select("id")
          .eq("offer_id", offerId)
          .eq("action_type", actionType)
          .eq("status", "pending")
          .maybeSingle();
        return existing
          ? { ok: true, requestId: existing.id as string, deduplicated: true }
          : { ok: false, error: "unique_violation_but_not_found" };
      }
      return { ok: false, error: error.message };
    }

    return { ok: true, requestId: data.id as string, deduplicated: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Estimativas de custo em USD pra cada tipo de ação.
 * Baseado em pricing OpenAI Oct 2025:
 *  - Whisper: $0.006 / minuto
 *  - GPT-4o-mini text: $0.150 / 1M input tokens, $0.600 / 1M output
 */
export const COST_ESTIMATES = {
  // Whisper média ~30s de criativo
  transcribe_creative: 0.003, // $0.003 ≈ 30s
  // Whisper média 30min de VSL (chunked) — pode chegar a $0.36 em VSL de 60min
  transcribe_vsl: 0.18,
  // GPT-4o-mini ~5k tokens input + 200 output
  ai_authoring: 0.001,
} as const satisfies Record<AiActionType, number>;
