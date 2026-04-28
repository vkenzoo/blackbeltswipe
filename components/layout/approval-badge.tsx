"use client";

import { useEffect, useState } from "react";

/**
 * Badge pequeno que mostra quantas pages estão aguardando aprovação.
 * Roda só pra admin (sidebar já gate por role). Polla a cada 60s.
 */
export function ApprovalBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch("/api/admin/approvals/count", {
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
        background: "color-mix(in srgb, #F59E0B 22%, transparent)",
        color: "#F59E0B",
        border: "1px solid color-mix(in srgb, #F59E0B 40%, transparent)",
      }}
      title={`${count} page${count === 1 ? "" : "s"} aguardando aprovação`}
      aria-label={`${count} pages aguardando aprovação`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
