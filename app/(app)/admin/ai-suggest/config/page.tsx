import Link from "next/link";
import { ChevronLeft, Settings } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ConfigForm } from "./config-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AiSuggestConfigPage() {
  await requireAdmin();

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1080px] mx-auto">
      <Link
        href="/admin/ai-suggest"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-2 hover:text-text transition-colors w-fit -mb-2"
      >
        <ChevronLeft size={14} strokeWidth={1.8} />
        Voltar pra AI Suggest
      </Link>

      <header className="flex flex-col gap-1">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em]">
          <Settings size={12} strokeWidth={2} />
          AI Suggest · Configuração
        </div>
        <h1 className="display text-[28px] font-semibold tracking-[-0.03em]">
          Ajustar comportamento da IA
        </h1>
        <p className="text-[13px] text-text-2 max-w-[680px]">
          Liga/desliga a feature inteira, escolhe quais campos sugerir, ajusta o
          modelo e edita os prompts. Quando o modelo erra consistentemente
          (título vago, estrutura errada), refina o prompt aqui em vez de
          corrigir em cada oferta manualmente.
        </p>
      </header>

      <ConfigForm />
    </div>
  );
}
