"use client";

import { ArrowUpRight, X } from "lucide-react";
import { useState } from "react";

export function PromoBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div
      className="relative flex items-center gap-4 px-5 py-3 rounded-[var(--r-lg)] glass overflow-hidden"
      role="banner"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 80% 50%, rgba(255,255,255,0.06) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex-1 min-w-0">
        <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-text-3 mb-0.5">
          Novidade
        </div>
        <div className="text-[13px] font-medium text-text">
          Academy — aprenda a criar ofertas escaladas do zero
        </div>
      </div>
      <a
        href="#"
        className="relative flex items-center gap-1.5 text-[12px] font-medium text-text
                   hover:text-text-2 transition-colors duration-200"
      >
        Acessar
        <ArrowUpRight size={14} strokeWidth={2} />
      </a>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="relative p-1 text-text-3 hover:text-text transition-colors duration-200"
        aria-label="Fechar banner"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
