import Link from "next/link";
import { ChevronLeft, Layers } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { BulkImportClient } from "./bulk-import-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BulkAdLibraryPage() {
  await requireAdmin();

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1280px] mx-auto">
      <Link
        href="/admin/offers"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-2 hover:text-text transition-colors w-fit -mb-2"
      >
        <ChevronLeft size={14} strokeWidth={1.8} />
        Voltar pras ofertas
      </Link>

      <header className="flex flex-col gap-1">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em]">
          <Layers size={12} strokeWidth={2} />
          Bulk import · Ad Library
        </div>
        <h1 className="display text-[28px] font-semibold tracking-[-0.02em]">
          Subir múltiplas ofertas de uma vez
        </h1>
        <p className="text-[13px] text-text-2 max-w-[700px] mt-1 leading-relaxed">
          Cola até 50 links do Ad Library (ou landing page) — uma URL por linha.
          Sistema cria as ofertas em modo{" "}
          <strong className="text-text">draft</strong>, enfileira os workers e
          mostra a timeline ao vivo. Nenhuma vai pro catálogo público sem tua
          aprovação depois.
        </p>
      </header>

      <BulkImportClient />
    </div>
  );
}
