"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Check,
  X,
  RefreshCw,
  Loader2,
  TrendingUp,
  Target,
  Quote,
  Hash,
  DollarSign,
} from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
  type Offer,
  type AiDraft,
} from "@/lib/types";

type Props = {
  offer: Offer;
};

type FieldKey = "suggested_title" | "structure" | "traffic_source" | "ai_summary";

export function AiDraftBanner({ offer }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState<
    null | "accept" | "accept-all" | "discard" | "regenerate"
  >(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [acceptedLocal, setAcceptedLocal] = useState<Set<string>>(
    new Set(offer.ai_accepted_fields ?? [])
  );

  const draft = offer.ai_draft;

  // Não renderiza se não tem draft, já descartou, ou já foi totalmente aceito
  if (!draft) return null;
  if (offer.ai_discarded_at) return null;

  // Lista dos campos que têm sugestão válida
  const candidateFields: Array<{
    key: FieldKey;
    label: string;
    icon: React.ReactNode;
    currentValue: string | null | undefined;
    suggestedValue: string | null | undefined;
  }> = [];

  if (draft.suggested_title) {
    candidateFields.push({
      key: "suggested_title",
      label: "Título (gancho)",
      icon: <Quote size={12} strokeWidth={2} />,
      currentValue: offer.title,
      suggestedValue: draft.suggested_title,
    });
  }
  if (draft.structure) {
    candidateFields.push({
      key: "structure",
      label: "Estrutura",
      icon: <Target size={12} strokeWidth={2} />,
      currentValue: STRUCTURE_LABELS[offer.structure],
      suggestedValue: STRUCTURE_LABELS[draft.structure],
    });
  }
  if (draft.traffic_source) {
    candidateFields.push({
      key: "traffic_source",
      label: "Tráfego",
      icon: <TrendingUp size={12} strokeWidth={2} />,
      currentValue: TRAFFIC_LABELS[offer.traffic_source],
      suggestedValue: TRAFFIC_LABELS[draft.traffic_source],
    });
  }
  if (draft.ai_summary) {
    candidateFields.push({
      key: "ai_summary",
      label: "Resumo",
      icon: <Hash size={12} strokeWidth={2} />,
      currentValue: offer.ai_summary ?? "(vazio)",
      suggestedValue: draft.ai_summary,
    });
  }

  // Filtra só os que ainda NÃO foram aceitos
  const pendingFields = candidateFields.filter(
    (f) => !acceptedLocal.has(f.key)
  );

  // Se tudo já foi aceito, não mostra mais o banner
  if (pendingFields.length === 0) return null;

  async function acceptFields(fields: FieldKey[], label: string) {
    setLoading(fields.length > 1 ? "accept-all" : "accept");
    try {
      const res = await fetch(
        `/api/admin/offers/${offer.id}/ai-authoring/accept`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fields }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.message ?? data.error ?? "erro desconhecido");
      }
      toast({
        kind: "success",
        title: `${label} aceita${fields.length > 1 ? "s" : ""}`,
        description: "Campos atualizados na oferta.",
      });
      setAcceptedLocal((prev) => {
        const next = new Set(prev);
        for (const f of fields) next.add(f);
        return next;
      });
      router.refresh();
    } catch (err) {
      toast({
        kind: "error",
        title: "Não consegui aplicar",
        description: err instanceof Error ? err.message : "erro",
      });
    } finally {
      setLoading(null);
    }
  }

  async function discardAll() {
    setLoading("discard");
    try {
      const res = await fetch(
        `/api/admin/offers/${offer.id}/ai-authoring/discard`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast({
        kind: "info",
        title: "Sugestões descartadas",
        description: "Nada foi alterado na oferta.",
      });
      router.refresh();
    } catch (err) {
      toast({
        kind: "error",
        title: "Erro ao descartar",
        description: err instanceof Error ? err.message : "erro",
      });
    } finally {
      setLoading(null);
      setConfirmDiscard(false);
    }
  }

  async function regenerate() {
    setLoading("regenerate");
    try {
      const res = await fetch(`/api/admin/offers/${offer.id}/ai-authoring`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast({
        kind: "success",
        title: "Job de IA enfileirado",
        description: "Aguarda ~15-30s e atualiza a página pra ver sugestões novas.",
      });
      router.refresh();
    } catch (err) {
      toast({
        kind: "error",
        title: "Erro ao re-gerar",
        description: err instanceof Error ? err.message : "erro",
      });
    } finally {
      setLoading(null);
    }
  }

  const allKeys = pendingFields.map((f) => f.key);
  const confidenceLow =
    draft.structure_confidence !== undefined &&
    draft.structure_confidence < 0.7;

  return (
    <>
      <div
        className="glass rounded-[var(--r-lg)] overflow-hidden"
        style={{
          borderLeft: "3px solid var(--accent)",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--accent) 4%, transparent) 0%, transparent 100%)",
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-full grid place-items-center shrink-0"
              style={{
                background:
                  "color-mix(in srgb, var(--accent) 14%, transparent)",
                color: "var(--accent)",
              }}
            >
              <Sparkles size={16} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col gap-0.5">
              <h3 className="display text-[15px] font-semibold text-text flex items-center gap-2">
                IA sugeriu {pendingFields.length} campo
                {pendingFields.length === 1 ? "" : "s"}
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    color: "var(--accent)",
                    background:
                      "color-mix(in srgb, var(--accent) 14%, transparent)",
                  }}
                >
                  Aguardando revisão
                </span>
              </h3>
              <p className="text-[12px] text-text-2">
                Nada foi alterado na oferta ainda. Revisa cada campo e aceita só
                o que fizer sentido.
                {draft.model && (
                  <span className="mono text-[10.5px] text-text-3 ml-2">
                    · {draft.model}
                    {draft.tokens_used &&
                      ` · ${draft.tokens_used.prompt}+${draft.tokens_used.completion}t`}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={regenerate}
              disabled={loading !== null}
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-full
                text-[11.5px] font-medium text-text-2 hover:text-text
                glass-light hover:bg-[var(--bg-glass-hover)]
                transition-colors disabled:opacity-50
              "
            >
              {loading === "regenerate" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <RefreshCw size={11} strokeWidth={1.8} />
              )}
              Re-gerar
            </button>
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              disabled={loading !== null}
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-full
                text-[11.5px] font-medium text-[var(--error)]
                hover:bg-[color-mix(in_srgb,var(--error)_10%,transparent)]
                transition-colors disabled:opacity-50
              "
            >
              <X size={11} strokeWidth={2} />
              Descartar
            </button>
            <button
              type="button"
              onClick={() => acceptFields(allKeys, "Todas as sugestões")}
              disabled={loading !== null}
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-full
                bg-[var(--accent)] text-black font-semibold text-[11.5px]
                hover:scale-[1.02] active:scale-[0.97]
                transition-transform disabled:opacity-50 disabled:hover:scale-100
              "
            >
              {loading === "accept-all" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Check size={11} strokeWidth={2.5} />
              )}
              Aceitar todos
            </button>
          </div>
        </div>

        {/* Metadata extras (price tier, tags, confidence) */}
        {(draft.estimated_price_tier || draft.tags || draft.structure_reason) && (
          <div className="px-5 py-3 border-b border-[var(--border-hairline)] flex items-center gap-3 flex-wrap text-[11.5px]">
            {draft.estimated_price_tier && draft.estimated_price_tier !== "unknown" && (
              <span className="inline-flex items-center gap-1 text-text-2">
                <DollarSign size={11} strokeWidth={1.8} className="text-text-3" />
                Price tier:{" "}
                <strong className="text-text">{draft.estimated_price_tier}</strong>
              </span>
            )}
            {draft.structure_reason && (
              <span className="text-text-3 italic truncate" title={draft.structure_reason}>
                &ldquo;{draft.structure_reason}&rdquo;
                {confidenceLow && (
                  <span className="ml-1 text-[10px] font-semibold" style={{ color: "#F59E0B" }}>
                    · confidence baixa
                  </span>
                )}
              </span>
            )}
            {draft.tags && draft.tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {draft.tags.map((t) => (
                  <span
                    key={t}
                    className="mono text-[10px] text-text-3 px-1.5 py-0.5 rounded"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Campos com sugestão */}
        <ul className="divide-y divide-[var(--border-hairline)]">
          {pendingFields.map((f) => (
            <li key={f.key} className="px-5 py-3 flex items-start gap-4 flex-wrap">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
                  <span className="text-text-3">{f.icon}</span>
                  {f.label}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div
                    className="rounded-[var(--r-sm)] px-3 py-2 flex flex-col gap-0.5"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-hairline)",
                    }}
                  >
                    <span className="text-[10px] uppercase tracking-wider text-text-3 font-semibold">
                      Atual
                    </span>
                    <span className="text-[12.5px] text-text-2 line-clamp-3">
                      {f.currentValue ?? "(vazio)"}
                    </span>
                  </div>
                  <div
                    className="rounded-[var(--r-sm)] px-3 py-2 flex flex-col gap-0.5"
                    style={{
                      background:
                        "color-mix(in srgb, var(--accent) 6%, transparent)",
                      border:
                        "1px solid color-mix(in srgb, var(--accent) 22%, transparent)",
                    }}
                  >
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1"
                      style={{ color: "var(--accent)" }}
                    >
                      <Sparkles size={9} strokeWidth={2} />
                      IA sugere
                    </span>
                    <span className="text-[12.5px] text-text line-clamp-3">
                      {f.suggestedValue}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => acceptFields([f.key], f.label)}
                disabled={loading !== null}
                className="
                  inline-flex items-center gap-1 h-7 px-3 rounded-full
                  text-[11px] font-semibold text-[var(--success)]
                  border border-[color-mix(in_srgb,var(--success)_30%,transparent)]
                  hover:bg-[color-mix(in_srgb,var(--success)_10%,transparent)]
                  transition-colors disabled:opacity-50 shrink-0 mt-6
                "
                title={`Aceitar sugestão pra ${f.label}`}
              >
                {loading === "accept" ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Check size={11} strokeWidth={2.5} />
                )}
                Aceitar
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Descartar sugestões da IA?"
        description="As sugestões serão descartadas e o banner some. Os campos da oferta permanecem exatamente como estão hoje. Pode re-gerar depois se mudar de ideia."
        confirmLabel="Sim, descartar"
        cancelLabel="Manter"
        tone="warning"
        loading={loading === "discard"}
        onCancel={() => !loading && setConfirmDiscard(false)}
        onConfirm={discardAll}
      />
    </>
  );
}
