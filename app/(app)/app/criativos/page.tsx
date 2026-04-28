import { CreativesBrowser } from "@/components/creatives/creatives-browser";
import { createClient } from "@/lib/supabase/server";

export default async function CriativosPage() {
  const supabase = await createClient();

  // Busca todos os creatives visíveis + offer context pra filtragem
  const { data: creatives } = await supabase
    .from("creatives")
    .select(
      `
      id, offer_id, kind, asset_url, thumbnail_url, duration_seconds,
      captured_at, caption, published_at, visible, display_order,
      transcript_text, transcribed_at,
      offer:offers!inner(
        id, slug, title, niche, language, structure, traffic_source, status,
        thumb_gradient
      )
    `
    )
    .eq("visible", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("captured_at", { ascending: false });

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <header className="flex flex-col gap-1">
        <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
          Criativos
        </h1>
        <p className="text-[13px] text-text-2">
          {creatives?.length ?? 0} criativos de ofertas escaladas — filtráveis
          por nicho, idioma, tipo e mais.
        </p>
      </header>

      <CreativesBrowser
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        creatives={(creatives as any) ?? []}
      />
    </div>
  );
}
