import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * POST /api/admin/ai-actions/[id]/reject
 *
 * Marca a request como rejected — nenhum job é enfileirado, request fica
 * no histórico pra auditoria.
 *
 * Body opcional: { reason: string }
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string"
      ? body.reason.slice(0, 300)
      : "rejected_by_admin";

  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (service.from("ai_action_requests") as any)
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      rejection_reason: reason,
    })
    .eq("id", id)
    .eq("status", "pending") // só rejeita se ainda tava pending
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_pending_or_not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
