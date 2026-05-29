import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * PATCH /api/profile
 *
 * Body: { name?: string, avatar_url?: string | null }
 *
 * Atualiza o próprio profile do user autenticado. Não permite mudar
 * email/role (esses são gerenciados via /admin/membros ou Supabase Auth).
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (trimmed.length > 80) {
      return NextResponse.json(
        { error: "name_too_long", max: 80 },
        { status: 400 }
      );
    }
    patch.name = trimmed.length > 0 ? trimmed : null;
  }
  if (body.avatar_url === null || typeof body.avatar_url === "string") {
    patch.avatar_url = body.avatar_url || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("profiles") as any)
    .update(patch)
    .eq("id", user.id)
    .select("id, email, name, avatar_url, role")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, profile: data });
}
