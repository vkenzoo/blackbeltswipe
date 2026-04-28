import { OffersBrowser } from "@/components/offers/offers-browser";
import { createClient } from "@/lib/supabase/server";
import type { Offer } from "@/lib/types";

export default async function Primeiras100Page() {
  const supabase = await createClient();
  const { data: offers } = await supabase
    .from("offers")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(100)
    .returns<Offer[]>();

  const list = offers ?? [];

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <header className="flex flex-col gap-1">
        <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-0.5">
          Espionagem
        </div>
        <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
          100 Ofertas
        </h1>
        <p className="text-[13px] text-text-2">
          {list.length === 0
            ? "Ainda não temos ofertas cadastradas."
            : `As ${list.length} primeiras ofertas da plataforma.`}
        </p>
      </header>

      <OffersBrowser offers={list} />
    </div>
  );
}
