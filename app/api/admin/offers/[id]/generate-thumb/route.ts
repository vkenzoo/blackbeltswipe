import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * POST /api/admin/offers/[id]/generate-thumb
 * Body: { source: "vsl" | "creative", creativeId? }
 * Enfileira job generate_thumb no worker.
 */
export async function POST(
  request: Request,
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

  const { id: offerId } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.source) return NextResponse.json({ error: "missing_source" }, { status: 400 });

  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error } = await (service.from("jobs") as any)
    .insert({
      kind: "generate_thumb",
      payload: {
        offer_id: offerId,
        source: body.source,
        creative_id: body.creativeId,
      },
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
