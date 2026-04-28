"use client";

import Link from "next/link";
import { ExternalLink, Sparkles, Download, Clock } from "lucide-react";
import type { Page, PageType } from "@/lib/types";

// ────────────────────────────────────────────────────────────
// types
// ────────────────────────────────────────────────────────────

const PAGE_TYPE_LABEL: Record<PageType, string> = {
  main_site: "Site Principal",
  fb_page: "Página do Facebook",
  ad_library: "Biblioteca do Facebook",
  checkout: "Checkout",
};

const PAGE_TYPE_SHORT: Record<PageType, string> = {
  main_site: "Landing Page",
  fb_page: "FB Page",
  ad_library: "Ad Library",
  checkout: "Checkout",
};

type EnrichedPage = Page & {
  screenshot_url?: string | null;
  fetched_at?: string | null;
};

// ────────────────────────────────────────────────────────────
// component
// ────────────────────────────────────────────────────────────

export function PagesTabs({
  pages,
  offerTitle,
}: {
  pages: EnrichedPage[];
  offerTitle?: string;
}) {
  return (
    <section className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
            Páginas
            {pages.length > 0 && (
              <span className="ml-2 mono text-text-2 normal-case tracking-normal">
                {pages.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="
              grid place-items-center w-9 h-9 rounded-full
              bg-[var(--accent-soft)] border border-[var(--border-hairline)]
              text-text hover:bg-[var(--accent-glow)]
              transition-colors
            "
            aria-label="Analisar com IA"
          >
            <Sparkles size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Cards grid */}
      {pages.length === 0 ? (
        <EmptyPagesState />
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pages.map((page) => (
            <PageCard key={page.id} page={page} offerTitle={offerTitle} />
          ))}
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// page card
// ────────────────────────────────────────────────────────────

function PageCard({
  page,
  offerTitle,
}: {
  page: EnrichedPage;
  offerTitle?: string;
}) {
  const enriched = !!page.fetched_at;
  const typeLabel = PAGE_TYPE_LABEL[page.type];
  const shortLabel = PAGE_TYPE_SHORT[page.type];

  return (
    <Link
      href={page.url}
      target="_blank"
      rel="noopener noreferrer"
      className="
        group glass rounded-[var(--r-lg)] overflow-hidden
        flex flex-col cursor-pointer
        transition-[transform,border-color] duration-[280ms] ease-[var(--ease-spring)]
        hover:-translate-y-[2px] hover:border-[var(--border-strong)]
      "
    >
      {/* Title + offer pill */}
      <div className="px-4 pt-4 pb-3 flex flex-col gap-1.5 items-center text-center">
        <h3 className="display text-[15px] font-semibold tracking-[-0.01em]">
          {page.title || shortLabel}
        </h3>
        {offerTitle && (
          <span
            className="
              inline-flex items-center
              text-[11px] font-medium
              px-2 py-0.5 rounded-full
              text-[var(--success)]
              border border-[var(--success)]/30
            "
            style={{
              background: "color-mix(in srgb, var(--success) 10%, transparent)",
            }}
          >
            {offerTitle}
          </span>
        )}
      </div>

      {/* Screenshot / placeholder */}
      <div className="mx-3 mb-3 aspect-[4/3] rounded-[var(--r-md)] border border-[var(--border-hairline)] overflow-hidden relative bg-[var(--bg-elevated)]">
        {page.screenshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.screenshot_url}
            alt={`Screenshot da página ${page.type} de ${offerTitle}`}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <PendingPreview type={page.type} />
        )}

        {/* Hover "Abrir" overlay (whole card is clickable via parent <Link>) */}
        <div
          className="
            absolute inset-0 z-10
            flex items-end justify-center
            opacity-0 group-hover:opacity-100
            transition-opacity duration-200
            bg-gradient-to-t from-black/60 via-transparent to-transparent
            p-3 pointer-events-none
          "
          aria-hidden="true"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-[11px] font-medium shadow-lg">
            Abrir <ExternalLink size={11} strokeWidth={2} />
          </span>
        </div>
      </div>

      {/* Footer: type + status + domain */}
      <div className="mt-auto px-4 py-3 border-t border-[var(--border-hairline)] flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-3 truncate" title={page.url}>
          {(() => {
            try {
              return new URL(page.url).hostname;
            } catch {
              return typeLabel;
            }
          })()}
        </span>
        {enriched ? (
          <span
            className="
              inline-flex items-center gap-1 shrink-0
              text-[10px] font-semibold
              px-2 py-0.5 rounded-full
              text-white
            "
            style={{
              background: "linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)",
            }}
          >
            <Download size={10} strokeWidth={2.2} />
            Baixar
          </span>
        ) : (
          <span
            className="
              inline-flex items-center gap-1 shrink-0
              text-[10px] font-semibold
              px-2 py-0.5 rounded-full
              text-[#F59E0B]
              border border-[#F59E0B]/30
            "
            style={{ background: "rgba(245, 158, 11, 0.08)" }}
          >
            <Clock size={10} strokeWidth={2.2} />
            Pendente
          </span>
        )}
      </div>
    </Link>
  );
}

// ────────────────────────────────────────────────────────────
// placeholder preview for pending pages
// ────────────────────────────────────────────────────────────

function PendingPreview({ type }: { type: PageType }) {
  const previewText =
    type === "ad_library"
      ? "Meta Ad Library"
      : type === "fb_page"
      ? "Facebook Page"
      : type === "checkout"
      ? "Checkout"
      : "Landing Page";

  return (
    <div
      className="absolute inset-0 grid place-items-center p-4"
      style={{
        background:
          "linear-gradient(180deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.04) 100%)",
      }}
    >
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.14em] text-text-3 mb-1.5 font-semibold">
          {previewText}
        </div>
        <div className="mono text-[10px] text-text-4">screenshot em breve</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// empty
// ────────────────────────────────────────────────────────────

function EmptyPagesState() {
  return (
    <div className="glass rounded-[var(--r-lg)] p-8 text-center">
      <div className="text-[13px] text-text-2">
        Nenhuma página cadastrada. Admin pode adicionar URLs em{" "}
        <Link
          href="/admin/offers"
          className="underline text-text hover:text-text"
        >
          /admin/offers
        </Link>
        .
      </div>
    </div>
  );
}
