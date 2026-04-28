"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Componente invisível que força `router.refresh()` a cada intervalo enquanto
 * houver pelo menos 1 oferta em processamento (title === "Extraindo...").
 * Usado na lista admin pra ver o progresso do worker from-url sem precisar
 * apertar F5.
 */
export function ListAutoRefresh({ hasExtracting }: { hasExtracting: boolean }) {
  const router = useRouter();
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hasExtracting) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 5000);
    tickRef.current = id;
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [hasExtracting, router]);

  return null;
}
