import { PromoBanner } from "@/components/layout/promo-banner";
import { OfferFilters } from "@/components/offers/offer-filters";
import { OfferGrid } from "@/components/offers/offer-grid";
import { Pagination } from "@/components/offers/pagination";
import { MOCK_OFFERS } from "@/lib/mock/offers";

export default function DashboardPage() {
  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <PromoBanner />

      <header className="flex flex-col gap-1">
        <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
          Ofertas curadas
        </h1>
        <p className="text-[13px] text-text-2">
          {MOCK_OFFERS.length} ofertas escalando no Facebook Ads
        </p>
      </header>

      <OfferFilters />

      <OfferGrid offers={MOCK_OFFERS} />

      <div className="pt-6 flex justify-center">
        <Pagination current={1} total={12} />
      </div>
    </div>
  );
}
