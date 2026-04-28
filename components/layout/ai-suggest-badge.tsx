"use client";

import { useEffect, useState } from "react";

/**
 * Badge do sidebar que mostra quantas sugestões de IA estão aguardando revisão.
 * Polla a cada 60s via endpoint compartilhado com o count de /admin/aprovacoes.
 */
export function AiSuggestBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch("/api/admin/ai-suggest/count", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number };
        if (!cancelled) setCount(data.count);
      } catch {
        /* silent */
      }
    }

    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (count === null || count === 0) return null;

  return (
    <span
      className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums"
      style={{
        background: "color-mix(in srgb, var(--accent) 22%, transparent)",
        color: "var(--accent)",
        border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
      }}
      title={`${count} sugest${count === 1 ? "ão" : "ões"} de IA aguardando revisão`}
      aria-label={`${count} sugestões de IA pendentes`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
