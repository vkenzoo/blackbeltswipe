import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * POST /api/admin/ai-actions/[id]/approve
 *
 * Marca a request como approved + cria job real em `jobs` table com payload
 * salvo na request. Worker pega normalmente.
 *
 * Idempotent: re-aprovar uma request já approved não duplica job.
 */
export async function POST(
  _req: Request,
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

  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Busca a request
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: req, error: fetchErr } = await (service as any)
    .from("ai_action_requests")
    .select("id, action_type, payload, status, job_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !req) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (req.status === "approved" && req.job_id) {
    return NextResponse.json({ ok: true, job_id: req.job_id, already: true });
  }
  if (req.status === "rejected") {
    return NextResponse.json(
      { error: "already_rejected" },
      { status: 409 }
    );
  }

  // Cria job real
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobErr } = await (service.from("jobs") as any)
    .insert({
      kind: req.action_type,
      payload: req.payload,
      status: "pending",
      priority: 70, // user-approved → prioridade alta
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: jobErr?.message ?? "job_create_failed" },
      { status: 500 }
    );
  }

  // Marca request como approved
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (service.from("ai_action_requests") as any)
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      job_id: job.id,
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, job_id: job.id });
}
