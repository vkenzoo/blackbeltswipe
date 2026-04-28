"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  pageId: string;
};

export function ApprovalActions({ pageId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState<null | "approve" | "reject">(null);
  const [confirmReject, setConfirmReject] = useState(false);

  async function approve() {
    setLoading("approve");
    try {
      const res = await fetch(`/api/admin/pages/${pageId}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verified: true, enqueue_sync: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast({
        kind: "success",
        title: "Page aprovada",
        description: "Sync de criativos enfileirado — os ads devem aparecer em alguns minutos.",
      });
      router.refresh();
    } catch (err) {
      toast({
        kind: "error",
        title: "Não consegui aprovar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setLoading(null);
    }
  }

  async function reject() {
    setLoading("reject");
    try {
      const res = await fetch(`/api/admin/pages/${pageId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast({
        kind: "success",
        title: "Page removida",
        description: "Os criativos vinculados permanecem escondidos.",
      });
      router.refresh();
    } catch (err) {
      toast({
        kind: "error",
        title: "Não consegui remover",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setLoading(null);
      setConfirmReject(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setConfirmReject(true)}
          disabled={loading !== null}
          className="
            inline-flex items-center gap-1 px-3 h-7 rounded-full
            text-[11px] font-medium text-[var(--error)]
            hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]
            transition-colors disabled:opacity-50
          "
        >
          {loading === "reject" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <X size={11} strokeWidth={2} />
          )}
          Rejeitar
        </button>
        <button
          type="button"
          onClick={approve}
          disabled={loading !== null}
          className="
            inline-flex items-center gap-1 px-3 h-7 rounded-full
            text-[11px] font-semibold text-white
            transition-opacity disabled:opacity-50
          "
          style={{ background: "var(--success)" }}
        >
          {loading === "approve" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Check size={11} strokeWidth={2.2} />
          )}
          Aprovar
        </button>
      </div>

      <ConfirmDialog
        open={confirmReject}
        title="Rejeitar essa page?"
        description="A page será removida do banco. Os criativos que vieram dela continuam escondidos. Pode ser re-cadastrada depois se for engano."
        warning="Ação só reversível cadastrando manualmente de novo."
        confirmLabel="Sim, rejeitar"
        cancelLabel="Cancelar"
        tone="danger"
        loading={loading === "reject"}
        onCancel={() => !loading && setConfirmReject(false)}
        onConfirm={reject}
      />
    </>
  );
}
