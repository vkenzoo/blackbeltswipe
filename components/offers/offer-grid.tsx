import type { Offer } from "@/lib/types";
import { OfferCard } from "./offer-card";

export function OfferGrid({ offers }: { offers: Offer[] }) {
  return (
    <div
      className="
        grid gap-5
        grid-cols-1
        min-[520px]:grid-cols-2
        min-[820px]:grid-cols-3
        min-[1280px]:grid-cols-4
        min-[1600px]:grid-cols-5
      "
    >
      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} />
      ))}
    </div>
  );
}
