import Link from "next/link";
import { Plus, ChevronRight, Package, Layers, Pencil, Zap, Loader2, Link2 } from "lucide-react";
import { FromUrlButton } from "./from-url-button";
import { ListAutoRefresh } from "./list-auto-refresh";
import { ExtractingRowStatus } from "./extracting-row-status";
import { listOffersPaginated } from "@/lib/queries/offers-list";
import {
  LANGUAGE_LABELS,
  NICHE_LABELS,
  STATUS_LABELS,
  STRUCTURE_LABELS,
} from "@/lib/types";
import { OfferPill } from "@/components/offers/offer-pill";
import { formatDateShort, formatNumber } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isOfferExtracting } from "@/lib/offer-status";

export default async function AdminOffersPage() {
  await requireAdmin();
  // Paginação: 150 ofertas por página, ordenadas por created_at DESC.
  // Quando passar de 150 no catálogo, adicionar UI de "carregar mais".
  const { offers, total, has_more } = await listOffersPaginated({
    limit: 150,
    adminAll: true,
  });
  const hasExtracting = offers.some(isOfferExtracting);

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1680px] mx-auto">
      <ListAutoRefresh hasExtracting={hasExtracting} />
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
            Admin
          </div>
          <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
            Ofertas
          </h1>
          <p className="text-[13px] text-text-2 mt-1">
            {has_more
              ? `Mostrando ${offers.length} de ${total} ofertas (mais recentes primeiro)`
              : `${total} ${total === 1 ? "oferta cadastrada" : "ofertas cadastradas"}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <FromUrlButton />
          <Link
            href="/admin/offers/bulk-ad-library"
            className="
              inline-flex items-center gap-2 px-4 py-2.5 rounded-full
              border border-[var(--border-default)] text-text font-medium text-[13px]
              hover:bg-[var(--bg-glass)] hover:border-[var(--border-strong)]
              transition-[transform,background,border-color] duration-200 ease-[var(--ease-spring)]
              hover:scale-[1.02]
              active:scale-[0.97]
            "
            title="Cola múltiplas URLs do Ad Library e processa todas com progresso ao vivo"
          >
            <Link2 size={15} strokeWidth={1.8} />
            Bulk · Ad Library
          </Link>
          <Link
            href="/admin/offers/batch"
            className="
              inline-flex items-center gap-2 px-4 py-2.5 rounded-full
              border border-[var(--border-default)] text-text font-medium text-[13px]
              hover:bg-[var(--bg-glass)] hover:border-[var(--border-strong)]
              transition-[transform,background,border-color] duration-200 ease-[var(--ease-spring)]
              hover:scale-[1.02]
              active:scale-[0.97]
            "
            title="Sobe múltiplos arquivos mp4 de uma vez"
          >
            <Layers size={15} strokeWidth={1.8} />
            Bulk · MP4s
          </Link>
          <Link
            href="/admin/offers/new"
            className="
              inline-flex items-center gap-2 px-4 py-2.5 rounded-full
              border border-[var(--border-default)] text-text font-medium text-[13px]
              hover:bg-[var(--bg-glass)] hover:border-[var(--border-strong)]
              transition-[transform,background,border-color] duration-200 ease-[var(--ease-spring)]
              hover:scale-[1.02]
              active:scale-[0.97]
            "
          >
            <Plus size={15} strokeWidth={1.8} />
            Nova oferta
          </Link>
        </div>
      </header>

      {offers.length === 0 ? (
        <div className="glass rounded-[var(--r-lg)] p-12 flex flex-col items-center gap-3">
          <Package size={32} strokeWidth={1.2} className="text-text-3" />
          <div className="text-center">
            <p className="text-[15px] font-medium text-text mb-1">
              Nenhuma oferta cadastrada ainda
            </p>
            <p className="text-[13px] text-text-2">
              Clica em Nova oferta pra adicionar a primeira.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass rounded-[var(--r-lg)] overflow-x-auto">
          <table className="w-full min-w-[900px]">
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
              {offers.map((offer) => {
                const lang = LANGUAGE_LABELS[offer.language];
                const isExtracting = isOfferExtracting(offer);
                const statusVariant =
                  offer.status === "active"
                    ? "success"
                    : offer.status === "paused"
                    ? "error"
                    : "default";
                return (
                  <tr
                    key={offer.id}
                    className={`
                      border-t border-[var(--border-hairline)]
                      text-[13px]
                      hover:bg-[var(--bg-elevated)]
                      transition-colors duration-150
                      ${isExtracting ? "row-extracting" : ""}
                    `}
                  >
                    <td className="px-5 py-3">
                      {isExtracting ? (
                        <ExtractingRowStatus offerId={offer.id} />
                      ) : (
                        <Link
                          href={`/app/${offer.slug}`}
                          className="font-medium text-text hover:underline"
                        >
                          {offer.title}
                        </Link>
                      )}
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
                      {offer.launched_at ? formatDateShort(offer.launched_at) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Link
                          href={`/admin/offers/${offer.id}/edit`}
                          className="
                            inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full
                            text-[11px] font-medium text-text-2
                            hover:text-text hover:bg-[var(--bg-glass)]
                            transition-colors
                          "
                          aria-label="Editar oferta"
                        >
                          <Pencil size={11} strokeWidth={1.8} />
                          Editar
                        </Link>
                        <Link
                          href={`/app/${offer.slug}`}
                          target="_blank"
                          className="
                            grid place-items-center w-7 h-7 rounded-full
                            text-text-3 hover:text-text hover:bg-[var(--bg-glass)]
                            transition-colors
                          "
                          aria-label="Abrir oferta em nova aba"
                        >
                          <ChevronRight size={14} strokeWidth={1.8} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
