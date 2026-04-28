import { createServiceClient } from "@/lib/supabase/server";

export type PendingPage = {
  id: string;
  offer_id: string;
  url: string;
  title: string | null;
  meta_page_id: string | null;
  discovered_via: string | null;
  created_at: string;
  screenshot_url: string | null;
};

export type PendingOfferGroup = {
  offer_id: string;
  offer_slug: string;
  offer_title: string;
  offer_status: string;
  offer_thumb_path: string | null;
  /** Quantas pages VERIFIED a oferta já tem (contexto pro admin) */
  verified_count: number;
  /** Pages aguardando revisão */
  pending_pages: PendingPage[];
};

/**
 * Busca todas pages ad_library em quarentena (verified_for_sync=false)
 * agrupadas por oferta. Usado na /admin/aprovacoes pra admin revisar
 * uma a uma.
 */
export async function listPendingApprovals(): Promise<PendingOfferGroup[]> {
  const supa = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pendingRaw } = await (supa as any)
    .from("pages")
    .select(
      "id, offer_id, url, title, meta_page_id, discovered_via, created_at, screenshot_url"
    )
    .eq("type", "ad_library")
    .eq("verified_for_sync", false)
    .order("created_at", { ascending: false });

  const pending: PendingPage[] = (pendingRaw ?? []) as PendingPage[];
  if (pending.length === 0) return [];

  const offerIds = [...new Set(pending.map((p) => p.offer_id))];

  // Busca ofertas
  const { data: offers } = await supa
    .from("offers")
    .select("id, slug, title, status, vsl_thumbnail_path")
    .in("id", offerIds)
    .returns<
      {
        id: string;
        slug: string;
        title: string;
        status: string;
        vsl_thumbnail_path: string | null;
      }[]
    >();

  const offerMap = new Map((offers ?? []).map((o) => [o.id, o]));

  // Busca contagem de pages VERIFIED por oferta (context)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: verifiedRaw } = await (supa as any)
    .from("pages")
    .select("offer_id")
    .eq("type", "ad_library")
    .eq("verified_for_sync", true)
    .in("offer_id", offerIds);

  const verifiedCount = new Map<string, number>();
  for (const v of (verifiedRaw ?? []) as { offer_id: string }[]) {
    verifiedCount.set(v.offer_id, (verifiedCount.get(v.offer_id) ?? 0) + 1);
  }

  // Agrupa
  const groupsMap = new Map<string, PendingOfferGroup>();
  for (const p of pending) {
    const offer = offerMap.get(p.offer_id);
    if (!offer) continue;
    const existing = groupsMap.get(p.offer_id);
    if (existing) {
      existing.pending_pages.push(p);
    } else {
      groupsMap.set(p.offer_id, {
        offer_id: p.offer_id,
        offer_slug: offer.slug,
        offer_title: offer.title,
        offer_status: offer.status,
        offer_thumb_path: offer.vsl_thumbnail_path,
        verified_count: verifiedCount.get(p.offer_id) ?? 0,
        pending_pages: [p],
      });
    }
  }

  // Ordena ofertas por número de pendentes DESC (mais bagunçadas primeiro)
  return [...groupsMap.values()].sort(
    (a, b) => b.pending_pages.length - a.pending_pages.length
  );
}

/**
 * Só a contagem — usado no badge do sidebar.
 */
export async function countPendingApprovals(): Promise<number> {
  const supa = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supa as any)
    .from("pages")
    .select("id", { count: "exact", head: true })
    .eq("type", "ad_library")
    .eq("verified_for_sync", false);

  return count ?? 0;
}
