import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/offers
 * Cria uma nova oferta. Só admins podem acessar.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  // Verifica auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Verifica role admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Campos obrigatórios
  const required = ["slug", "title", "niche", "language", "structure"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `missing_${field}` },
        { status: 400 }
      );
    }
  }

  // Random thumb_gradient 1-20 se não veio
  const thumb_gradient =
    body.thumb_gradient ?? Math.floor(Math.random() * 20) + 1;

  const payload = {
    slug: body.slug,
    title: body.title,
    niche: body.niche,
    language: body.language,
    structure: body.structure,
    traffic_source: body.traffic_source ?? "facebook",
    status: body.status ?? "draft",
    ad_count: body.ad_count ?? 0,
    launched_at: body.launched_at ?? null,
    thumb_gradient,
    flags: body.flags ?? [],
    created_by: user.id,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("offers") as any)
    .insert(payload)
    .select("id, slug")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, offer: data }, { status: 201 });
}
