/**
 * logUserEvent — envia evento pro /api/events/log
 *
 * Silent fail — nunca dá throw. Se o log falhar, segue a vida.
 * NÃO bloqueia await (fire-and-forget por default).
 *
 * Uso:
 *   import { logUserEvent } from "@/lib/events/log-event";
 *
 *   // Depois do login bem-sucedido
 *   logUserEvent("sign_in");
 *
 *   // Com payload
 *   logUserEvent("transcript_download", { creative_id, offer_slug });
 *
 *   // Aguardar conclusão (pra evitar race com signOut por exemplo)
 *   await logUserEvent("sign_out", undefined, { await: true });
 */
export type UserEventKind =
  | "sign_in"
  | "sign_up"
  | "sign_out"
  | "favorite_add"
  | "favorite_remove"
  | "transcript_download"
  | "offer_view"
  | "profile_update"
  | "role_change"
  | "admin_action";

export function logUserEvent(
  kind: UserEventKind,
  payload?: Record<string, unknown>,
  opts?: { await?: boolean }
): Promise<void> {
  const promise = fetch("/api/events/log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, payload }),
    // keepalive garante que o request completa mesmo se a página navegar
    // (importante pro sign_out que precede redirect)
    keepalive: true,
  })
    .then(() => {
      // ok ou não — silencioso
    })
    .catch(() => {
      // silent fail
    });

  if (opts?.await) return promise;
  return Promise.resolve();
}
