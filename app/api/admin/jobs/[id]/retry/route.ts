import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/jobs/[id]/retry
 *
 * Reseta um job em status=error pra pending + limpa retry_at + attempts.
 * Usado pelo botão "Retry" no /admin/workers pra ressucitar jobs que
 * esgotaram retries automáticos.
 *
 * Só admin.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  const service = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error } = await (service.from("jobs") as any)
    .update({
      status: "pending",
      error: null,
      started_at: null,
      finished_at: null,
      attempts: 0,
      retry_at: null,
      priority: 100, // prioridade alta pra pegar rápido
    })
    .eq("id", id)
    .in("status", ["error", "done"]) // só permite retry de jobs terminados
    .select("id, kind")
    .single();

  if (error || !job) {
    return NextResponse.json(
      { error: "retry_failed", detail: error?.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, job_id: job.id, kind: job.kind });
}
