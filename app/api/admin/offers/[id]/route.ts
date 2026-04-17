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
 * PATCH /api/admin/offers/[id]
 * Atualiza campos de uma oferta existente.
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
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // whitelist de campos editáveis
  const allowed = [
    "title",
    "slug",
    "niche",
    "language",
    "structure",
    "traffic_source",
    "status",
    "ad_count",
    "launched_at",
    "thumb_gradient",
    "flags",
    "transcript_preview",
    "transcript_text",
    "ai_summary",
    "vsl_storage_path",
    "vsl_thumbnail_path",
    "vsl_duration_seconds",
    "vsl_size_bytes",
    "vsl_uploaded_at",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.supabase.from("offers") as any)
    .update(patch)
    .eq("id", id)
    .select("id, slug")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, offer: data });
}

/**
 * DELETE /api/admin/offers/[id]
 * Remove uma oferta.
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

  const { error } = await auth.supabase.from("offers").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
