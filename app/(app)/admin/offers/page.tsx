import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { MOCK_OFFERS } from "@/lib/mock/offers";
import {
  LANGUAGE_LABELS,
  NICHE_LABELS,
  STATUS_LABELS,
  STRUCTURE_LABELS,
} from "@/lib/types";
import { OfferPill } from "@/components/offers/offer-pill";
import { formatDateShort, formatNumber } from "@/lib/utils";

export default function AdminOffersPage() {
  return (
    <div className="relative z-10 px-8 py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
            Admin
          </div>
          <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
            Ofertas
          </h1>
          <p className="text-[13px] text-text-2 mt-1">
            {MOCK_OFFERS.length} ofertas cadastradas
          </p>
        </div>
        <Link
          href="/admin/offers/new"
          className="
            inline-flex items-center gap-2 px-4 py-2.5 rounded-full
            bg-[var(--accent)] text-black font-medium text-[13px]
            shadow-[0_4px_20px_var(--accent-glow),inset_0_1px_0_rgba(255,255,255,0.4)]
            transition-[transform,box-shadow] duration-200 ease-[var(--ease-spring)]
            hover:scale-[1.02] hover:-translate-y-[1px]
            active:scale-[0.97]
          "
        >
          <Plus size={15} strokeWidth={2} />
          Nova oferta
        </Link>
      </header>

      <div className="glass rounded-[var(--r-lg)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] text-left">
              <th className="px-5 py-3 font-semibold">Oferta</th>
              <th className="px-5 py-3 font-semibold">Nicho</th>
              <th className="px-5 py-3 font-semibold">Estrutura</th>
              <th className="px-5 py-3 font-semibold">Idioma</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold text-right">Anúncios</th>
              <th className="px-5 py-3 font-semibold">Lançada</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {MOCK_OFFERS.map((offer) => {
              const lang = LANGUAGE_LABELS[offer.language];
              const statusVariant =
                offer.status === "active"
                  ? "success"
                  : offer.status === "paused"
                  ? "error"
                  : "default";
              return (
                <tr
                  key={offer.id}
                  className="
                    border-t border-[var(--border-hairline)]
                    text-[13px]
                    hover:bg-[var(--bg-elevated)]
                    transition-colors duration-150
                  "
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/app/${offer.slug}`}
                      className="font-medium text-text hover:underline"
                    >
                      {offer.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-text-2">
                    {NICHE_LABELS[offer.niche]}
                  </td>
                  <td className="px-5 py-3 text-text-2">
                    {STRUCTURE_LABELS[offer.structure]}
                  </td>
                  <td className="px-5 py-3 text-text-2">
                    {lang.flag} {offer.language}
                  </td>
                  <td className="px-5 py-3">
                    <OfferPill
                      size="sm"
                      variant={statusVariant}
                      dot={offer.status === "active"}
                    >
                      {STATUS_LABELS[offer.status]}
                    </OfferPill>
                  </td>
                  <td className="px-5 py-3 text-right mono font-medium">
                    {formatNumber(offer.ad_count)}
                  </td>
                  <td className="px-5 py-3 text-text-3">
                    {formatDateShort(offer.launched_at)}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/app/${offer.slug}`}
                      className="
                        grid place-items-center w-7 h-7 rounded-full
                        text-text-3 hover:text-text hover:bg-[var(--bg-glass)]
                        transition-colors
                      "
                      aria-label="Abrir oferta"
                    >
                      <ChevronRight size={14} strokeWidth={1.8} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
