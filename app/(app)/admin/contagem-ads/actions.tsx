"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertCircle,
  History,
} from "lucide-react";

export function RefreshOfferButton({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<"idle" | "ok" | "error">("idle");

  async function handleClick() {
    setDone("idle");
    try {
      const res = await fetch("/api/admin/ad-count/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer_ids: [offerId] }),
      });
      if (!res.ok) {
        setDone("error");
        return;
      }
      const json = await res.json();
      if (json.enqueued > 0 || json.reason === "all_already_enqueued") {
        setDone("ok");
        startTransition(() => {
          router.refresh();
        });
      } else {
        setDone("error");
      }
    } catch {
      setDone("error");
    }
    setTimeout(() => setDone("idle"), 3000);
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending || done !== "idle"}
      className="
        inline-flex items-center gap-1.5 h-8 px-3 rounded-full
        glass-light text-[12px] font-medium text-text-2
        hover:text-text hover:bg-[var(--bg-glass-hover)]
        disabled:opacity-50 transition-colors
      "
      title="Força refresh imediato desta oferta"
    >
      {done === "ok" ? (
        <>
          <CheckCircle2 size={12} className="text-[#22C55E]" />
          Enfileirado
        </>
      ) : done === "error" ? (
        <>
          <AlertCircle size={12} className="text-[#EF4444]" />
          Erro
        </>
      ) : (
        <>
          <RefreshCw
            size={12}
            strokeWidth={1.8}
            className={isPending ? "animate-spin" : ""}
          />
          Refresh
        </>
      )}
    </button>
  );
}

export function BackfillHistoryButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    kind: "idle" | "ok" | "error";
    enqueued?: number;
    skipped?: number;
  }>({ kind: "idle" });

  async function handleClick() {
    if (
      !confirm(
        "Reconstruir histórico de 30 dias via Meta Ad Library?\n\nVai usar ad_active_status=ALL pra cada Page, pegar ads ativos+inativos e calcular quantos estavam rodando por dia.\n\nCusto: ~1-2 calls por oferta. Só processa offers com <3 snapshots (preserva dados ao-vivo existentes)."
      )
    )
      return;

    setResult({ kind: "idle" });
    try {
      const res = await fetch("/api/admin/ad-count/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "no_history", days: 30 }),
      });
      if (!res.ok) {
        setResult({ kind: "error" });
        return;
      }
      const json = await res.json();
      setResult({
        kind: "ok",
        enqueued: json.enqueued,
        skipped: json.skipped,
      });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setResult({ kind: "error" });
    }
    setTimeout(() => setResult({ kind: "idle" }), 5000);
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="
        inline-flex items-center gap-2 h-9 px-4 rounded-full
        glass-light text-[13px] font-medium text-text
        hover:bg-[var(--bg-glass-hover)] disabled:opacity-60 transition-colors
      "
      title="Reconstrói histórico de 30 dias via Meta API (ad_active_status=ALL)"
    >
      {result.kind === "ok" ? (
        <>
          <CheckCircle2 size={13} className="text-[#22C55E]" />
          Backfill: {result.enqueued} enfileirado
          {result.enqueued === 1 ? "" : "s"}
        </>
      ) : result.kind === "error" ? (
        <>
          <AlertCircle size={13} className="text-[#EF4444]" />
          Erro
        </>
      ) : (
        <>
          <History
            size={13}
            strokeWidth={1.8}
            className={isPending ? "animate-pulse" : ""}
          />
          Backfill histórico (30d)
        </>
      )}
    </button>
  );
}

export function RefreshStaleButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    kind: "idle" | "ok" | "error";
    enqueued?: number;
    skipped?: number;
  }>({ kind: "idle" });

  async function handleClick() {
    if (
      !confirm(
        "Forçar refresh de TODAS as ofertas stale (>48h sem refresh)? Vai enfileirar um job por oferta."
      )
    )
      return;

    setResult({ kind: "idle" });
    try {
      const res = await fetch("/api/admin/ad-count/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "stale" }),
      });
      if (!res.ok) {
        setResult({ kind: "error" });
        return;
      }
      const json = await res.json();
      setResult({
        kind: "ok",
        enqueued: json.enqueued,
        skipped: json.skipped,
      });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setResult({ kind: "error" });
    }
    setTimeout(() => setResult({ kind: "idle" }), 4000);
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="
        inline-flex items-center gap-2 h-9 px-4 rounded-full
        bg-[var(--accent)] text-[var(--bg)] text-[13px] font-medium
        hover:opacity-90 disabled:opacity-60 transition-opacity
      "
      title="Enfileira refresh_ad_count pra todas as ofertas stale"
    >
      {result.kind === "ok" ? (
        <>
          <CheckCircle2 size={13} />
          {result.enqueued}{" "}
          {result.enqueued === 1 ? "enfileirada" : "enfileiradas"}
        </>
      ) : result.kind === "error" ? (
        <>
          <AlertCircle size={13} />
          Erro
        </>
      ) : (
        <>
          <Zap
            size={13}
            strokeWidth={1.8}
            className={isPending ? "animate-pulse" : ""}
          />
          Refresh stale
        </>
      )}
    </button>
  );
}
