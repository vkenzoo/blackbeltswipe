"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { OfferPill } from "@/components/offers/offer-pill";
import { STATUS_LABELS, type OfferStatus } from "@/lib/types";

const STATUS_VARIANT: Record<OfferStatus, "success" | "warning" | "default"> = {
  active: "success",
  paused: "warning",
  draft: "default",
};

const STATUS_ORDER: OfferStatus[] = ["active", "paused", "draft"];

/**
 * Cell de status com dropdown inline pra mudar status sem entrar na edit
 * page. Otimista — atualiza UI antes da response, faz rollback se a API
 * falhar.
 */
export function StatusCell({
  offerId,
  status: initialStatus,
}: {
  offerId: string;
  status: OfferStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<OfferStatus>(initialStatus);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Sincroniza quando server-side props mudarem (depois de router.refresh)
  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  async function changeStatus(next: OfferStatus) {
    if (next === status || saving) {
      setOpen(false);
      return;
    }
    const prev = status;
    setStatus(next); // optimistic
    setOpen(false);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/offers/${offerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      // Refresh server-side data sem full reload
      router.refresh();
    } catch (err) {
      setStatus(prev); // rollback
      setError(err instanceof Error ? err.message : "erro");
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!saving) setOpen((v) => !v);
        }}
        disabled={saving}
        title="Clica pra mudar status"
        className="
          inline-flex items-center gap-1 cursor-pointer
          hover:opacity-80 transition-opacity
          disabled:cursor-wait disabled:opacity-60
        "
      >
        {saving ? (
          <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] text-text-3 border border-[var(--border-default)]">
            <Loader2 size={11} className="animate-spin" />
            ...
          </span>
        ) : (
          <>
            <OfferPill
              size="sm"
              variant={STATUS_VARIANT[status]}
              dot={status === "active"}
            >
              {STATUS_LABELS[status]}
            </OfferPill>
            <ChevronDown
              size={10}
              strokeWidth={2}
              className="text-text-3"
            />
          </>
        )}
      </button>

      {open && !saving && (
        <div
          className="
            absolute left-0 top-full mt-1 z-50 min-w-[140px]
            glass-strong rounded-[var(--r-md)] py-1
            border border-[var(--border-default)]
            shadow-[0_8px_24px_rgba(0,0,0,0.5)]
          "
          onClick={(e) => e.stopPropagation()}
        >
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => changeStatus(s)}
              className="
                w-full flex items-center justify-between gap-2 px-3 py-2
                text-[12px] text-text hover:bg-[var(--bg-glass-hover)]
                transition-colors
              "
            >
              <span className="flex items-center gap-2">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      s === "active"
                        ? "var(--success)"
                        : s === "paused"
                          ? "var(--warning, #F59E0B)"
                          : "var(--text-3)",
                  }}
                />
                {STATUS_LABELS[s]}
              </span>
              {s === status && (
                <Check size={11} strokeWidth={2.5} className="text-[var(--accent)]" />
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <span
          className="
            absolute left-0 top-full mt-1 z-50 whitespace-nowrap
            text-[10px] text-[var(--error)]
            bg-[color-mix(in_srgb,var(--error)_15%,black)]
            px-2 py-1 rounded
          "
        >
          {error}
        </span>
      )}
    </div>
  );
}
