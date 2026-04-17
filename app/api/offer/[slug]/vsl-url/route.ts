import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/offer/[slug]/vsl-url
 * Gera signed URL (1h) pro VSL de uma oferta.
 *
 * Retorna 404 se:
 * - oferta não existe
 * - oferta não está active (exceto pra admin)
 * - oferta não tem vsl_storage_path
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  // Verifica auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Busca oferta — RLS já filtra active/admin
  const { data: offer } = await supabase
    .from("offers")
    .select("id, slug, status, vsl_storage_path")
    .eq("slug", slug)
    .maybeSingle<{
      id: string;
      slug: string;
      status: string;
      vsl_storage_path: string | null;
    }>();

  if (!offer || !offer.vsl_storage_path) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Gera signed URL (1h = 3600s)
  const { data, error } = await supabase.storage
    .from("vsls")
    .createSignedUrl(offer.vsl_storage_path, 3600);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "sign_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: data.signedUrl,
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  });
}
