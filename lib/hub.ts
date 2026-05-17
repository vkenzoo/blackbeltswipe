/**
 * Cliente do Hub Central — consulta entitlements (tier/acesso) do usuário.
 *
 * Variáveis de ambiente:
 *   HUB_API_BASE — ex: https://hub-webhooks.vercel.app
 *   HUB_API_KEY  — bearer secret fornecido pelo hub
 */

const SYSTEM_SLUG = "blackbelt";

export interface HubEntitlement {
  kind: "system_access" | "cademi_course";
  system: string | null;
  tier: string | null;
  cademi_course_id: string | null;
  expires_at: string | null;
}

interface HubResponse {
  email: string;
  found: boolean;
  customer_id?: string;
  entitlements: HubEntitlement[];
}

export async function getEntitlement(email: string): Promise<HubEntitlement | null> {
  const base = process.env.HUB_API_BASE;
  const key = process.env.HUB_API_KEY;
  if (!base || !key) {
    console.warn("[hub] HUB_API_BASE ou HUB_API_KEY ausente");
    return null;
  }

  const url = `${base}/api/entitlements/${encodeURIComponent(email)}?system=${SYSTEM_SLUG}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[hub] non-OK:", res.status);
      return null;
    }
    const data = (await res.json()) as HubResponse;
    if (!data.found) return null;
    return data.entitlements[0] ?? null;
  } catch (err) {
    console.error("[hub] failed:", err);
    return null;
  }
}

export function isExpired(ent: HubEntitlement): boolean {
  if (!ent.expires_at) return false;
  return new Date(ent.expires_at) <= new Date();
}
