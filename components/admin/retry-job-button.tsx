"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2, Check } from "lucide-react";

/**
 * Botão "Retry" pra jobs em status=error permanente no /admin/workers.
 * Chama POST /api/admin/jobs/[id]/retry → reseta pra pending com priority=100.
 */
export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [isPending, startTransition] = useTransition();

  async function retry() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/retry`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "falhou");
      setState("success");
      // Refresh após 1s pra mostrar o novo status
      setTimeout(() => {
        startTransition(() => {
          router.refresh();
        });
      }, 800);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={retry}
      disabled={state === "loading" || isPending}
      title="Reenfileira o job com priority alta"
      className="
        inline-flex items-center gap-1 px-2 py-0.5 rounded
        text-[10.5px] font-medium
        border transition-colors
        disabled:opacity-70 disabled:cursor-not-allowed
      "
      style={{
        borderColor:
          state === "success"
            ? "var(--success)"
            : state === "error"
            ? "var(--error)"
            : "var(--border-hairline)",
        background:
          state === "success"
            ? "color-mix(in srgb, var(--success) 12%, transparent)"
            : state === "error"
            ? "color-mix(in srgb, var(--error) 12%, transparent)"
            : "var(--bg-elevated)",
        color:
          state === "success"
            ? "var(--success)"
            : state === "error"
            ? "var(--error)"
            : "var(--text-2)",
      }}
    >
      {state === "loading" ? (
        <>
          <Loader2 size={10} className="animate-spin" />
          retry...
        </>
      ) : state === "success" ? (
        <>
          <Check size={10} strokeWidth={2.4} />
          ok
        </>
      ) : state === "error" ? (
        <>falhou</>
      ) : (
        <>
          <RotateCcw size={10} strokeWidth={1.8} />
          retry
        </>
      )}
    </button>
  );
}
