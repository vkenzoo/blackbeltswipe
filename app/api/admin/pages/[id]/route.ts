import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * DELETE /api/admin/pages/[id]
 * Remove uma page permanentemente (o worker para de monitorar).
 * Admin-only.
 *
 * PATCH /api/admin/pages/[id]
 * Body: { visible?: boolean, title?: string }
 * Update parcial (visibility toggle, rename).
 */

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "unauthorized" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (profile?.role !== "admin") {
    return { ok: false as const, status: 403, error: "forbidden" };
  }
  return { ok: true as const, user };
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const service = createServiceClient();

  const { error } = await service.from("pages").delete().eq("id", id);

  if (error) {
    console.error("[pages DELETE] error:", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    visible?: boolean;
    title?: string;
  };

  const updates: Record<string, unknown> = {};
  if (typeof body.visible === "boolean") updates.visible = body.visible;
  if (typeof body.title === "string") updates.title = body.title.slice(0, 200);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  const service = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (service.from("pages") as any)
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("[pages PATCH] error:", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
