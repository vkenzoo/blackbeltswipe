import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * POST /api/admin/creatives/[id]/transcribe
 * Enfileira job `transcribe_creative` no worker.
 */
export async function POST(
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

  const { id: creativeId } = await params;
  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: c } = await service
    .from("creatives")
    .select("kind")
    .eq("id", creativeId)
    .maybeSingle<{ kind: string }>();
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (c.kind !== "video") {
    return NextResponse.json({ error: "creative_not_video" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error } = await (service.from("jobs") as any)
    .insert({
      kind: "transcribe_creative",
      payload: { creative_id: creativeId },
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !job) {
    return NextResponse.json(
      { error: error?.message ?? "job_create_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, job_id: job.id }, { status: 202 });
}
