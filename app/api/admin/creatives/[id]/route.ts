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
 * PATCH /api/admin/creatives/[id]
 * Edita visible, display_order, caption, published_at de um criativo.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const allowed = ["visible", "display_order", "caption", "published_at", "thumbnail_url"];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase.from("creatives") as any)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, creative: data });
}

/**
 * DELETE /api/admin/creatives/[id]
 * Remove criativo + arquivos no Storage (best-effort).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Pega asset/thumb pra cleanup
  const { data: creative } = await auth.supabase
    .from("creatives")
    .select("asset_url, thumbnail_url")
    .eq("id", id)
    .maybeSingle<{ asset_url: string | null; thumbnail_url: string | null }>();

  const { error } = await auth.supabase.from("creatives").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 }
    );
  }

  // Cleanup storage — asset_url pode ser path no bucket ou URL externa
  if (creative?.asset_url) {
    const path = extractStoragePath(creative.asset_url, "creatives");
    if (path) {
      await auth.supabase.storage.from("creatives").remove([path]).catch(() => {});
    }
  }
  if (creative?.thumbnail_url) {
    const path = extractStoragePath(creative.thumbnail_url, "creatives");
    if (path) {
      await auth.supabase.storage.from("creatives").remove([path]).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Extrai path do objeto no bucket a partir de URL ou path puro.
 * Retorna null se a URL é externa (não aponta pro nosso bucket).
 */
function extractStoragePath(assetUrl: string, bucket: string): string | null {
  // Se é só um path relativo (sem protocolo), assume que tá no bucket
  if (!/^https?:\/\//i.test(assetUrl)) {
    return assetUrl;
  }
  // URL do Supabase Storage: .../storage/v1/object/{public|sign}/{bucket}/{path}
  const m = assetUrl.match(new RegExp(`/object/(?:public|sign)/${bucket}/(.+?)(?:\\?|$)`));
  return m ? m[1] : null;
}
