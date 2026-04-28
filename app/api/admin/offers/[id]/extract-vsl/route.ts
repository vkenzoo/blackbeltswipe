import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * POST /api/admin/offers/[id]/extract-vsl
 * Body: { landingUrl: string, transcribe?: boolean }
 *
 * Enfileira job `extract_vsl` no worker. Retorna 202 + job_id.
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
  if (!body?.landingUrl || !/^https?:\/\//i.test(body.landingUrl)) {
    return NextResponse.json({ error: "missing_or_invalid_landingUrl" }, { status: 400 });
  }

  // Bloqueia URLs que nunca têm VSL extraível: checkouts (Hotmart, Kiwify...),
  // perfis sociais (Instagram, TikTok, YouTube), shorteners não resolvidos.
  // Evita worker queimar 30min timeout procurando mp4 inexistente.
  const { isLandingCandidateUrl, isCheckoutUrl, isRedirectOrSocialUrl } =
    await import("@/lib/security");
  if (!isLandingCandidateUrl(body.landingUrl)) {
    const reason = isCheckoutUrl(body.landingUrl)
      ? "checkout_url_no_vsl"
      : isRedirectOrSocialUrl(body.landingUrl)
        ? "social_or_redirect_url_no_vsl"
        : "unsupported_url";
    let host = "";
    try { host = new URL(body.landingUrl).hostname; } catch {}
    return NextResponse.json(
      {
        error: reason,
        message:
          reason === "social_or_redirect_url_no_vsl"
            ? `URL de ${host} é perfil social (Instagram/TikTok/YT/FB) ou shortener. VSL só é extraída de landing page do advertiser. Cole a URL da landing (ex: minhaoferta.com).`
            : reason === "checkout_url_no_vsl"
              ? `URL ${host} é checkout (Hotmart/Kiwify/etc). Checkouts não têm VSL. Use a landing page do advertiser.`
              : "URL não suportada pra extração de VSL.",
        host,
      },
      { status: 400 }
    );
  }

  const service = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Dedup: se já há extract_vsl pending ou running pra essa oferta, retorna
  // o job existente em vez de enfileirar duplicata. Cenário comum: admin
  // clica 2x o botão "Extrair VSL" — antes criava 2 jobs (desperdício
  // de ~10min de worker). Extract_vsl tem concurrency=1, então duplicata
  // bloqueia toda fila.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (service.from("jobs") as any)
    .select("id, status, created_at")
    .eq("kind", "extract_vsl")
    .in("status", ["pending", "running"])
    .filter("payload->>offer_id", "eq", offerId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    const dup = existing[0] as { id: string; status: string; created_at: string };
    const ageSec = Math.floor(
      (Date.now() - new Date(dup.created_at).getTime()) / 1000
    );
    return NextResponse.json(
      {
        ok: true,
        job_id: dup.id,
        deduped: true,
        existing_status: dup.status,
        existing_age_seconds: ageSec,
        message: `Já tem extract_vsl ${dup.status} há ${ageSec}s — aguarde`,
      },
      { status: 202 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error } = await (service.from("jobs") as any)
    .insert({
      kind: "extract_vsl",
      payload: {
        offer_id: offerId,
        landing_url: body.landingUrl,
        transcribe: !!body.transcribe,
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
