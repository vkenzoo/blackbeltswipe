import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized", status: 401 as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") return { error: "forbidden", status: 403 as const };
  return { supabase, user };
}

/**
 * POST /api/admin/offers/[id]/creatives
 * Adiciona um novo criativo a uma oferta.
 * Body: { kind, asset_url, thumbnail_url?, duration_seconds?, caption?, published_at? }
 * Arquivos já foram uploadados client-side; aqui só persiste metadata.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: offerId } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.kind || !["video", "image"].includes(body.kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (!body.asset_url) {
    return NextResponse.json({ error: "missing_asset_url" }, { status: 400 });
  }

  // Cap check (max 30 criativos por oferta — política global)
  const { getCreativeCapStatus, assetUrlExists, MAX_CREATIVES_PER_OFFER } =
    await import("@/lib/worker/creative-cap");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capStatus = await getCreativeCapStatus(auth.supabase as any, offerId);
  if (capStatus.atCap) {
    return NextResponse.json(
      {
        error: "cap_reached",
        message: `Oferta já tem ${capStatus.current}/${MAX_CREATIVES_PER_OFFER} criativos. Remova algum antes de adicionar.`,
        current: capStatus.current,
        max: MAX_CREATIVES_PER_OFFER,
      },
      { status: 409 }
    );
  }

  // Dedup: se asset_url já existe pra essa oferta, rejeita
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDup = await assetUrlExists(auth.supabase as any, offerId, body.asset_url);
  if (isDup) {
    return NextResponse.json(
      {
        error: "duplicate_asset",
        message: "Esse criativo (asset_url) já existe nessa oferta.",
        asset_url: body.asset_url,
      },
      { status: 409 }
    );
  }

  // próxima display_order: max atual + 1
  const { data: maxRow } = await auth.supabase
    .from("creatives")
    .select("display_order")
    .eq("offer_id", offerId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ display_order: number }>();
  const nextOrder = (maxRow?.display_order ?? -1) + 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase.from("creatives") as any)
    .insert({
      offer_id: offerId,
      kind: body.kind,
      asset_url: body.asset_url,
      thumbnail_url: body.thumbnail_url ?? null,
      duration_seconds: body.duration_seconds ?? null,
      caption: body.caption ?? null,
      published_at: body.published_at ?? null,
      visible: body.visible ?? true,
      display_order: body.display_order ?? nextOrder,
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique violation (race condition entre check + insert)
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error: "duplicate_asset",
          message: "Esse criativo já foi inserido (race condition).",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, creative: data }, { status: 201 });
}
