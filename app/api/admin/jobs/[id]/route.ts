import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/jobs/[id]
 * Retorna status + metadata do job enfileirado no worker.
 *   { id, kind, status, error, attempts, started_at, finished_at }
 */
export async function GET(
  _request: Request,
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
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, kind, status, error, attempts, payload, created_at, started_at, finished_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(job);
}
