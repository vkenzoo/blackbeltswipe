import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/creatives/[id]/transcript
 * Retorna o transcript_text como .txt pra download.
 *
 * Query `?format=json` retorna metadata JSON em vez de texto cru.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: creative } = await supabase
    .from("creatives")
    .select(
      `id, transcript_text, transcript_preview, transcribed_at, caption,
       duration_seconds,
       offer:offers!inner(slug, title)`
    )
    .eq("id", id)
    .maybeSingle();

  if (!creative) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = creative as any;

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "json") {
    return NextResponse.json({
      id: c.id,
      offer_slug: c.offer?.slug,
      offer_title: c.offer?.title,
      transcript_text: c.transcript_text,
      transcript_preview: c.transcript_preview,
      transcribed_at: c.transcribed_at,
      caption: c.caption,
      duration_seconds: c.duration_seconds,
    });
  }

  if (!c.transcript_text) {
    return NextResponse.json({ error: "no_transcript" }, { status: 404 });
  }

  // Monta texto pra download com header
  const body = `${c.offer?.title ?? "Criativo"} · ${new Date(c.transcribed_at ?? Date.now()).toLocaleString("pt-BR")}
${c.duration_seconds ? `Duração: ${Math.round(c.duration_seconds)}s` : ""}
${"─".repeat(60)}

${c.transcript_text}
`;

  const slug = (c.offer?.slug ?? "criativo").replace(/[^a-z0-9-]/gi, "-");
  const fname = `transcricao-${slug}-${c.id.slice(0, 8)}.txt`;

  // Loga evento de download (fire-and-forget — usa service pra bypass RLS no insert)
  try {
    const service = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (service as any).from("user_events").insert({
      user_id: user.id,
      kind: "transcript_download",
      payload: {
        creative_id: c.id,
        offer_slug: c.offer?.slug,
        offer_title: c.offer?.title,
      },
      user_agent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    });
  } catch {
    // silent fail — não bloqueia o download
  }

  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
    },
  });
}
