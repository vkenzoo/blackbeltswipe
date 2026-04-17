import { PromoBanner } from "@/components/layout/promo-banner";
import { OfferFilters } from "@/components/offers/offer-filters";
import { OfferGrid } from "@/components/offers/offer-grid";
import { Pagination } from "@/components/offers/pagination";
import { listOffers } from "@/lib/queries/offers";

export default async function DashboardPage() {
  const offers = await listOffers();

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <PromoBanner />

      <header className="flex flex-col gap-1">
        <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
          Ofertas curadas
        </h1>
        <p className="text-[13px] text-text-2">
          {offers.length === 0
            ? "Nenhuma oferta disponível ainda."
            : `${offers.length} ofertas escalando no Facebook Ads`}
        </p>
      </header>

      <OfferFilters />

      {offers.length > 0 ? (
        <OfferGrid offers={offers} />
      ) : (
        <div className="glass rounded-[var(--r-lg)] p-12 text-center">
          <p className="text-[14px] text-text-2">
            Nenhuma oferta ativa no momento. Aguarde enquanto o time cura novas
            ofertas pra você.
          </p>
        </div>
      )}

      {offers.length > 20 && (
        <div className="pt-6 flex justify-center">
          <Pagination current={1} total={Math.ceil(offers.length / 20)} />
        </div>
      )}
    </div>
  );
}
