"use client";

import { SlidersHorizontal, TrendingUp, Video, BarChart3, Search } from "lucide-react";
import { OfferPill } from "./offer-pill";

export function OfferFilters() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <OfferPill icon={<SlidersHorizontal size={13} strokeWidth={1.8} />}>
        Filtros
      </OfferPill>

      <OfferPill
        dot
        className="text-accent"
        icon={null}
      >
        Escalando agora
      </OfferPill>

      <OfferPill icon={<Video size={13} strokeWidth={1.8} />}>
        Vídeo · Informações
      </OfferPill>

      <OfferPill icon={<BarChart3 size={13} strokeWidth={1.8} />}>
        Métricas
      </OfferPill>

      <div className="flex-1" />

      <div className="relative">
        <Search
          size={14}
          strokeWidth={1.8}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
        />
        <input
          type="search"
          placeholder="Buscar ofertas..."
          className="
            w-64 h-9
            pl-9 pr-3
            text-[13px]
            glass-light rounded-full
            text-text placeholder:text-text-3
            transition-[border-color,background] duration-200 ease-[var(--ease-standard)]
            hover:bg-[var(--bg-glass-hover)]
          "
        />
      </div>

      <select
        className="
          h-9 px-3.5 text-[12px] font-medium
          glass-light rounded-full
          text-text appearance-none cursor-pointer
          pr-8
          bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23A1A1A6%22 stroke-width=%221.8%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]
          bg-no-repeat bg-[right_12px_center]
        "
        defaultValue="20"
      >
        <option value="20">20 por página</option>
        <option value="40">40 por página</option>
        <option value="60">60 por página</option>
      </select>
    </div>
  );
}
