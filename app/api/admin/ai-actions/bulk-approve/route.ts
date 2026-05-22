import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * POST /api/admin/ai-actions/bulk-approve
 *
 * Body: { offer_id?: string, request_ids?: string[] }
 *
 * Aprova múltiplas requests de uma só vez. Cria jobs reais pra cada uma
 * + marca todas como approved.
 *
 * Padrões:
 *   - offer_id: aprova TODAS pending dessa oferta
 *   - request_ids: aprova só esses IDs específicos
 *   - se ambos vazios: erro
 */
export async function POST(req: Request) {
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
  const offerId = typeof body?.offer_id === "string" ? body.offer_id : null;
  const requestIds = Array.isArray(body?.request_ids)
    ? body.request_ids.filter((x: unknown) => typeof x === "string")
    : null;

  if (!offerId && (!requestIds || requestIds.length === 0)) {
    return NextResponse.json(
      { error: "missing_offer_id_or_request_ids" },
      { status: 400 }
    );
  }

  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Busca pending
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (service as any)
    .from("ai_action_requests")
    .select("id, action_type, payload")
    .eq("status", "pending");
  if (offerId) query = query.eq("offer_id", offerId);
  if (requestIds) query = query.in("id", requestIds);

  const { data: pending, error: fetchErr } = await query;
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, approved: 0, jobs: [] });
  }

  // Cria jobs em batch
  const jobRows = pending.map(
    (p: { action_type: string; payload: Record<string, unknown> }) => ({
      kind: p.action_type,
      payload: p.payload,
      status: "pending",
      priority: 70,
    })
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs, error: insErr } = await (service.from("jobs") as any)
    .insert(jobRows)
    .select("id");

  if (insErr || !jobs) {
    return NextResponse.json(
      { error: insErr?.message ?? "jobs_insert_failed" },
      { status: 500 }
    );
  }

  // Atualiza cada request com seu job_id correspondente
  // (paireia por índice — mesma ordem do select original)
  const now = new Date().toISOString();
  for (let i = 0; i < pending.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service.from("ai_action_requests") as any)
      .update({
        status: "approved",
        decided_at: now,
        decided_by: user.id,
        job_id: jobs[i].id,
      })
      .eq("id", pending[i].id);
  }

  return NextResponse.json({
    ok: true,
    approved: pending.length,
    jobs: jobs.map((j: { id: string }) => j.id),
  });
}
