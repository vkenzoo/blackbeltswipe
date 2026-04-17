import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MOCK_OFFERS, getOfferBySlug } from "@/lib/mock/offers";
import { getOfferPages } from "@/lib/mock/pages";
import { OfferHeader } from "@/components/detail/offer-header";
import { VslPlayer } from "@/components/detail/vsl-player";
import { MetricsPanel } from "@/components/detail/metrics-panel";
import { CreativesSection } from "@/components/detail/creatives-section";
import { PagesTabs } from "@/components/detail/pages-tabs";
import { TranscriptSection } from "@/components/detail/transcript-section";

export function generateStaticParams() {
  return MOCK_OFFERS.map((o) => ({ slug: o.slug }));
}

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const offer = getOfferBySlug(slug);
  if (!offer) notFound();

  const pages = getOfferPages(offer.id, offer.slug);

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-8 md:gap-10 max-w-[1680px] mx-auto">
      {/* Back link */}
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text transition-colors w-fit -mb-2"
      >
        <ChevronLeft size={15} strokeWidth={1.8} />
        Voltar
      </Link>

      <OfferHeader offer={offer} />

      {/* Main two-column layout */}
      <div className="grid gap-6 grid-cols-1 min-[1100px]:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <VslPlayer thumbGradientNumber={offer.thumb_gradient} />
        </div>
        <div className="flex flex-col gap-6">
          <MetricsPanel offer={offer} />
        </div>
      </div>

      <CreativesSection baseGradient={offer.thumb_gradient} />

      <TranscriptSection offer={offer} />

      <PagesTabs pages={pages} />
    </div>
  );
}
