"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  RefreshCw,
  Loader2,
  Sparkles,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
  NICHE_EMOJI,
  NICHE_LABELS,
  type Niche,
  type OfferStructure,
  type TrafficSource,
} from "@/lib/types";
import type { AiDraftRow } from "@/lib/queries/ai-drafts";

type Props = {
  drafts: AiDraftRow[];
  filter: "pending" | "accepted" | "discarded" | "all";
};

export function DraftsTable({ drafts, filter }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<null | "accept" | "discard" | "regen">(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const allSelected = drafts.length > 0 && selected.size === drafts.length;
  const someSelected = selected.size > 0 && selected.size < drafts.length;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(drafts.map((d) => d.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkAction(action: "accept_all" | "discard" | "regenerate") {
    const ids = [...selected];
    if (ids.length === 0) {
      toast({ kind: "error", title: "Nenhuma oferta selecionada" });
      return;
    }
    setLoading(
      action === "accept_all" ? "accept" : action === "discard" ? "discard" : "regen"
    );
    try {
      const res = await fetch("/api/admin/ai-suggest/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, offer_ids: ids }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const label =
        action === "accept_all"
          ? `${data.success} aceitas`
          : action === "discard"
            ? `${data.success} descartadas`
            : `${data.success} re-geradas`;
      toast({
        kind: "success",
        title: label,
        description:
          data.failed > 0
            ? `${data.failed} falharam — confere no log.`
            : action === "regenerate"
              ? "Worker vai processar em ~30s cada."
              : "Campos atualizados.",
      });
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast({
        kind: "error",
        title: "Erro na ação",
        description: err instanceof Error ? err.message : "erro",
      });
    } finally {
      setLoading(null);
      setConfirmDiscard(false);
      setConfirmRegen(false);
    }
  }

  const selectedCount = selected.size;

  // Ordena: pendentes primeiro, depois os outros
  const sortedDrafts = useMemo(() => {
    return [...drafts].sort((a, b) => {
      const aStatus = getStatus(a);
      const bStatus = getStatus(b);
      const order = { pending: 0, accepted: 1, discarded: 2 };
      return order[aStatus] - order[bStatus];
    });
  }, [drafts]);

  if (drafts.length === 0) {
    return (
      <div className="glass rounded-[var(--r-lg)] py-16 flex flex-col items-center gap-3">
        <div
          className="w-14 h-14 rounded-full grid place-items-center"
          style={{
            background: "color-mix(in srgb, var(--text-3) 14%, transparent)",
          }}
        >
          <Sparkles size={24} strokeWidth={1.5} className="text-text-3" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <h2 className="display text-[18px] font-semibold text-text">
            Nada aqui ainda
          </h2>
          <p className="text-[13px] text-text-3 text-center max-w-md">
            {filter === "pending"
              ? "Todas as sugestões já foram revisadas. Quando worker gerar drafts novos, eles aparecem aqui."
              : filter === "accepted"
                ? "Nenhum draft foi aceito ainda."
                : filter === "discarded"
                  ? "Nenhum draft foi descartado."
                  : "Ainda não há drafts gerados pelo sistema."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Bulk actions bar — sticky quando tem selecionado */}
      {selectedCount > 0 && (
        <div
          className="glass rounded-[var(--r-md)] px-4 py-3 flex items-center justify-between gap-3 flex-wrap sticky top-4 z-10"
          style={{
            borderLeft: "3px solid var(--accent)",
          }}
        >
          <span className="text-[13px] text-text">
            <strong className="font-semibold">{selectedCount}</strong>{" "}
            {selectedCount === 1 ? "oferta selecionada" : "ofertas selecionadas"}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={loading !== null}
              className="text-[12px] text-text-3 hover:text-text px-2"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => setConfirmRegen(true)}
              disabled={loading !== null}
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-full
                text-[11.5px] font-medium text-text-2 hover:text-text
                glass-light hover:bg-[var(--bg-glass-hover)]
                transition-colors disabled:opacity-50
              "
            >
              {loading === "regen" ? (
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
              onClick={() => bulkAction("accept_all")}
              disabled={loading !== null}
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-full
                bg-[var(--accent)] text-black font-semibold text-[11.5px]
                hover:scale-[1.02] active:scale-[0.97]
                transition-transform disabled:opacity-50 disabled:hover:scale-100
              "
            >
              {loading === "accept" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Check size={11} strokeWidth={2.5} />
              )}
              Aceitar todas sugestões
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="glass rounded-[var(--r-lg)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-text-3 font-semibold border-b border-[var(--border-hairline)]">
                <th className="text-left px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="cursor-pointer"
                    aria-label="Selecionar todas"
                  />
                </th>
                <th className="text-left px-3 py-3">Oferta</th>
                <th className="text-left px-3 py-3">Título atual → Sugerido</th>
                <th className="text-left px-3 py-3 w-[200px]">Estrutura</th>
                <th className="text-left px-3 py-3 w-[100px]">Tráfego</th>
                <th className="text-left px-3 py-3 w-[90px]">Price</th>
                <th className="text-left px-3 py-3 w-[110px]">Status</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {sortedDrafts.map((d) => (
                <DraftRow
                  key={d.id}
                  draft={d}
                  checked={selected.has(d.id)}
                  onToggle={() => toggleOne(d.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title={`Descartar ${selectedCount} draft${selectedCount === 1 ? "" : "s"}?`}
        description="As sugestões são descartadas e os banners somem das ofertas. Nada nos campos reais é alterado."
        confirmLabel="Sim, descartar"
        cancelLabel="Cancelar"
        tone="warning"
        loading={loading === "discard"}
        onCancel={() => !loading && setConfirmDiscard(false)}
        onConfirm={() => bulkAction("discard")}
      />

      <ConfirmDialog
        open={confirmRegen}
        title={`Re-gerar ${selectedCount} draft${selectedCount === 1 ? "" : "s"}?`}
        description={`Vai consumir ~$${(selectedCount * 0.003).toFixed(3)} em tokens do GPT-4o-mini. Drafts atuais serão substituídos pelos novos quando worker processar.`}
        confirmLabel="Sim, re-gerar"
        cancelLabel="Cancelar"
        tone="info"
        loading={loading === "regen"}
        onCancel={() => !loading && setConfirmRegen(false)}
        onConfirm={() => bulkAction("regenerate")}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// DraftRow
// ─────────────────────────────────────────────────────────────

function DraftRow({
  draft,
  checked,
  onToggle,
}: {
  draft: AiDraftRow;
  checked: boolean;
  onToggle: () => void;
}) {
  const status = getStatus(draft);
  const d = draft.ai_draft;

  const thumbUrl = draft.vsl_thumbnail_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public/thumbs/${draft.vsl_thumbnail_path}?width=80&quality=70&resize=cover`
    : null;

  const titleChanged =
    d?.suggested_title && d.suggested_title !== draft.title;
  const structureChanged =
    d?.structure && d.structure !== draft.structure;
  const trafficChanged =
    d?.traffic_source && d.traffic_source !== draft.traffic_source;

  const confidenceLow =
    d?.structure_confidence !== undefined && d.structure_confidence < 0.7;

  return (
    <tr
      className={`
        border-t border-[var(--border-hairline)] text-[12.5px]
        transition-colors
        ${checked ? "bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]" : "hover:bg-[var(--bg-glass)]"}
      `}
    >
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={status !== "pending"}
          className="cursor-pointer disabled:opacity-30"
          aria-label={`Selecionar ${draft.slug}`}
        />
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt={`Capa de ${draft.title}`}
              className="w-10 h-10 rounded-[var(--r-sm)] object-cover border border-[var(--border-hairline)] shrink-0"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-[var(--r-sm)] border border-[var(--border-hairline)] shrink-0"
              style={{ background: "var(--bg-elevated)" }}
            />
          )}
          <div className="flex flex-col gap-0 min-w-0">
            <span className="mono text-[10.5px] text-text-3 truncate">
              {draft.slug}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1 py-0.5 rounded w-fit"
              style={{ background: "var(--bg-elevated)", color: "var(--text-3)" }}
            >
              {NICHE_EMOJI[draft.niche as Niche] ?? "🌱"}{" "}
              {NICHE_LABELS[draft.niche as Niche] ?? draft.niche}
            </span>
          </div>
        </div>
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-col gap-0.5 min-w-0 max-w-[400px]">
          <span className="text-text-3 text-[11.5px] line-clamp-1" title={draft.title}>
            {draft.title}
          </span>
          {d?.suggested_title ? (
            <span
              className={`text-[12px] font-medium line-clamp-2 ${titleChanged ? "text-text" : "text-text-3 italic"}`}
              title={d.suggested_title}
            >
              {titleChanged ? "→ " : "= "}
              {d.suggested_title}
            </span>
          ) : (
            <span className="text-text-3 text-[11px] italic">(sem sugestão)</span>
          )}
        </div>
      </td>

      <td className="px-3 py-3">
        {d?.structure ? (
          <div className="flex flex-col gap-0.5">
            <span
              className={`text-[12px] ${structureChanged ? "font-semibold text-text" : "text-text-3"}`}
            >
              {STRUCTURE_LABELS[draft.structure as OfferStructure] ?? draft.structure}
              {structureChanged && (
                <>
                  <span className="text-text-3 mx-1">→</span>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    {STRUCTURE_LABELS[d.structure]}
                  </span>
                </>
              )}
            </span>
            {d.structure_confidence !== undefined && (
              <span
                className="text-[10px] mono"
                style={{
                  color: confidenceLow ? "#F59E0B" : "var(--text-3)",
                }}
                title={d.structure_reason ?? ""}
              >
                conf. {(d.structure_confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ) : (
          <span className="text-text-3 text-[11px]">—</span>
        )}
      </td>

      <td className="px-3 py-3">
        {d?.traffic_source ? (
          <span
            className={`text-[12px] ${trafficChanged ? "font-semibold text-text" : "text-text-3"}`}
          >
            {trafficChanged
              ? TRAFFIC_LABELS[d.traffic_source]
              : TRAFFIC_LABELS[draft.traffic_source as TrafficSource]}
          </span>
        ) : (
          <span className="text-text-3 text-[11px]">—</span>
        )}
      </td>

      <td className="px-3 py-3">
        {d?.estimated_price_tier && d.estimated_price_tier !== "unknown" ? (
          <PriceTierBadge tier={d.estimated_price_tier} />
        ) : (
          <span className="text-text-3 text-[11px]">—</span>
        )}
      </td>

      <td className="px-3 py-3">
        <StatusPill status={status} />
      </td>

      <td className="px-3 py-3">
        <Link
          href={`/admin/offers/${draft.id}/edit`}
          className="
            inline-flex items-center gap-1 px-2 h-7 rounded-full
            text-[11px] font-medium text-text-2 hover:text-text
            hover:bg-[var(--bg-glass)] transition-colors
          "
          title="Abrir oferta pra revisão detalhada"
        >
          Ver
          <ChevronRight size={11} strokeWidth={2} />
        </Link>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────

type Status = "pending" | "accepted" | "discarded";

function getStatus(d: AiDraftRow): Status {
  if (d.ai_accepted_at) return "accepted";
  if (d.ai_discarded_at) return "discarded";
  return "pending";
}

function StatusPill({ status }: { status: Status }) {
  const cfg = {
    pending: {
      label: "Pendente",
      color: "#F59E0B",
      icon: <Sparkles size={9} strokeWidth={2} />,
    },
    accepted: {
      label: "Aceita",
      color: "var(--success)",
      icon: <Check size={9} strokeWidth={2.5} />,
    },
    discarded: {
      label: "Descartada",
      color: "var(--text-3)",
      icon: <X size={9} strokeWidth={2} />,
    },
  }[status];

  return (
    <span
      className="inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full"
      style={{
        color: cfg.color,
        background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function PriceTierBadge({
  tier,
}: {
  tier: "low" | "mid" | "high" | "unknown";
}) {
  const cfg = {
    low: { label: "Low", color: "#06B6D4" },
    mid: { label: "Mid", color: "#F59E0B" },
    high: { label: "High", color: "#EC4899" },
    unknown: { label: "?", color: "var(--text-3)" },
  }[tier];

  return (
    <span
      className="inline-flex items-center text-[10.5px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
      style={{
        color: cfg.color,
        background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`,
      }}
    >
      {cfg.label}
    </span>
  );
}
