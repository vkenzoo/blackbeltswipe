import { OffersBrowser } from "@/components/offers/offers-browser";
import { listOffersPaginated } from "@/lib/queries/offers-list";

export default async function DashboardPage() {
  // Limite inicial de 200 ofertas. Quando a gente passar disso, adicionar UI
  // de paginação ("carregar mais") que chama uma API route consumindo o mesmo
  // helper com offset. Pra 20-200 ofertas, OffersBrowser filtra client-side.
  const { offers, total, has_more } = await listOffersPaginated({ limit: 200 });

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <header className="flex flex-col gap-1">
        <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
          Ofertas espionadas
        </h1>
        <p className="text-[13px] text-text-2">
          {offers.length === 0
            ? "Nenhuma oferta disponível ainda."
            : has_more
              ? `Mostrando ${offers.length} de ${total} ofertas (top por escala)`
              : `${total} ofertas escalando no Facebook Ads`}
        </p>
      </header>

      <OffersBrowser offers={offers} />
    </div>
  );
}
