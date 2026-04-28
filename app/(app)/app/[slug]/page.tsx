import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { getOfferBySlug } from "@/lib/queries/offers";
import {
  getOfferPagesPublic,
  getOfferCreativesPublic,
} from "@/lib/queries/pages-creatives";
import { OfferHeader } from "@/components/detail/offer-header";
import { VslPlayer } from "@/components/detail/vsl-player";
import { MetricsPanel } from "@/components/detail/metrics-panel";
import { CreativesSection } from "@/components/detail/creatives-section";
import { PagesTabs } from "@/components/detail/pages-tabs";
import { TranscriptSection } from "@/components/detail/transcript-section";
import { AdCountSparkline } from "@/components/detail/ad-count-sparkline";
import { getOfferSparkline30d } from "@/lib/queries/offer-sparkline";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streaming SSR — apenas a 1ª query (offer) bloqueia o render.
 * Pages + creatives + sparkline aparecem conforme chegam via <Suspense>.
 *
 * Ganho: FCP ~80ms em vez de ~400ms (esperando 4 queries em série).
 */
export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const offer = await getOfferBySlug(slug);
  if (!offer) notFound();

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-8 md:gap-10 max-w-[1680px] mx-auto">
      <Link
        href="/app"
        prefetch={true}
        className="inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text transition-colors w-fit -mb-2"
      >
        <ChevronLeft size={15} strokeWidth={1.8} />
        Voltar
      </Link>

      <OfferHeader offer={offer} />

      <div className="grid gap-6 grid-cols-1 min-[1100px]:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <VslPlayer
            slug={offer.slug}
            offerTitle={offer.title}
            hasVsl={!!offer.vsl_storage_path}
            thumbnailPath={offer.vsl_thumbnail_path}
            thumbGradientNumber={offer.thumb_gradient}
          />
        </div>
        <div className="flex flex-col gap-6">
          <MetricsPanel offer={offer} />
          <Suspense fallback={<SparklineSkeleton />}>
            <SparklineSection offerId={offer.id} currentAdCount={offer.ad_count ?? null} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<PagesTabsSkeleton />}>
        <PagesSection offerId={offer.id} offerTitle={offer.title} />
      </Suspense>

      <Suspense fallback={<CreativesSkeleton />}>
        <CreativesLoader offerId={offer.id} offer={offer} />
      </Suspense>

      <TranscriptSection offer={offer} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Async children — cada um bloqueia só a sua seção
// ─────────────────────────────────────────────────────────────

async function SparklineSection({
  offerId,
  currentAdCount,
}: {
  offerId: string;
  currentAdCount: number | null;
}) {
  const sparkline = await getOfferSparkline30d(offerId);
  return (
    <AdCountSparkline data={sparkline} currentAdCount={currentAdCount} />
  );
}

async function PagesSection({
  offerId,
  offerTitle,
}: {
  offerId: string;
  offerTitle: string;
}) {
  const pages = await getOfferPagesPublic(offerId);
  return <PagesTabs pages={pages} offerTitle={offerTitle} />;
}

async function CreativesLoader({
  offerId,
  offer,
}: {
  offerId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offer: any;
}) {
  const creatives = await getOfferCreativesPublic(offerId);
  return (
    <CreativesSection
      offer={offer}
      creatives={creatives}
      baseGradient={offer.thumb_gradient}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Skeleton fallbacks — matcheiam altura/shape da versão final
// ─────────────────────────────────────────────────────────────

function SparklineSkeleton() {
  return (
    <div className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-[120px] w-full" />
    </div>
  );
}

function PagesTabsSkeleton() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-48" />
        </div>
      </div>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="glass rounded-[var(--r-lg)] p-3 flex flex-col gap-2"
            aria-hidden="true"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="aspect-[4/3] w-full rounded-[var(--r-md)]" />
          </div>
        ))}
      </div>
    </section>
  );
}

function CreativesSkeleton() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-56" />
        </div>
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="glass rounded-[var(--r-md)] p-2 flex flex-col gap-2"
            aria-hidden="true"
          >
            <Skeleton className="aspect-[9/16] w-full rounded-[var(--r-sm)]" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    </section>
  );
}
