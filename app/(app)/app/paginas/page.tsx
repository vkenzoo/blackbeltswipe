import { PagesBrowser } from "@/components/pages/pages-browser";
import { createClient } from "@/lib/supabase/server";

export default async function PaginasPage() {
  const supabase = await createClient();
  const { data: pages } = await supabase
    .from("pages")
    .select(
      `
      id, offer_id, type, url, title, screenshot_url, fetched_at, visible, display_order,
      offer:offers!inner(
        id, slug, title, niche, language, structure, traffic_source, status
      )
    `
    )
    .eq("visible", true)
    .order("display_order", { ascending: true });

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <header className="flex flex-col gap-1">
        <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
          Páginas
        </h1>
        <p className="text-[13px] text-text-2">
          {pages?.length ?? 0} páginas indexadas — landing pages, Ad Libraries,
          checkouts e FB pages.
        </p>
      </header>

      <PagesBrowser
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pages={(pages as any) ?? []}
      />
    </div>
  );
}
