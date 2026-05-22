"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  X,
  Loader2,
  Brain,
  Mic,
  Film,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import type { PendingAiActionsGrouped } from "@/lib/queries/ai-action-requests";

const ACTION_META = {
  transcribe_creative: {
    label: "Transcrever criativo",
    icon: Film,
    color: "#10B981",
    desc: "Whisper transcreve o vídeo do anúncio (~30s áudio)",
  },
  transcribe_vsl: {
    label: "Transcrever VSL",
    icon: Mic,
    color: "#F59E0B",
    desc: "Whisper transcreve a VSL inteira (pode levar 5-15min)",
  },
  ai_authoring: {
    label: "AI Authoring (título + summary)",
    icon: Brain,
    color: "#8B5CF6",
    desc: "GPT-4o-mini gera title, ai_summary, structure, tags a partir do transcript",
  },
} as const;

export function AiActionsApprovals({
  groups,
}: {
  groups: PendingAiActionsGrouped[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <OfferAiGroup key={g.offer_id} group={g} />
      ))}
    </div>
  );
}

function OfferAiGroup({ group }: { group: PendingAiActionsGrouped }) {
  const router = useRouter();
  const [bulkLoading, setBulkLoading] = useState(false);

  async function approveAll() {
    if (bulkLoading) return;
    setBulkLoading(true);
    try {
      const res = await fetch(`/api/admin/ai-actions/bulk-approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offer_id: group.offer_id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(`Erro: ${d.error ?? res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <section className="glass rounded-[var(--r-lg)] overflow-hidden">
      {/* Header oferta */}
      <header className="px-5 py-4 flex items-center justify-between gap-3 border-b border-[var(--border-hairline)]">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`/admin/offers/${group.offer_id}/edit`}
              className="text-[14px] font-medium text-text hover:text-accent transition-colors truncate"
              title={group.offer_title}
            >
              {group.offer_title}
            </Link>
            <Link
              href={`/admin/offers/${group.offer_id}/edit`}
              className="text-text-3 hover:text-text shrink-0"
            >
              <ExternalLink size={11} strokeWidth={1.8} />
            </Link>
          </div>
          <div className="text-[11px] text-text-3 mono flex items-center gap-2">
            <span>/app/{group.offer_slug}</span>
            <span>·</span>
            <span>{group.offer_ad_count} ads</span>
            <span>·</span>
            <span>{group.requests.length} ação{group.requests.length > 1 ? "ões" : ""}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="mono text-[13px] font-semibold text-text">
            ${group.total_cost_usd.toFixed(3)}
          </span>
          <button
            type="button"
            onClick={approveAll}
            disabled={bulkLoading}
            className="
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
              bg-[var(--accent)] text-black font-medium text-[12px]
              hover:scale-[1.02] transition-transform duration-200 ease-[var(--ease-spring)]
              disabled:opacity-50 disabled:hover:scale-100
            "
          >
            {bulkLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Check size={12} strokeWidth={2.5} />
            )}
            Aprovar tudo
          </button>
        </div>
      </header>

      {/* Lista de ações */}
      <ul className="divide-y divide-[var(--border-hairline)]">
        {group.requests.map((req) => (
          <RequestRow key={req.id} request={req} />
        ))}
      </ul>
    </section>
  );
}

function RequestRow({
  request,
}: {
  request: PendingAiActionsGrouped["requests"][0];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const meta = ACTION_META[request.action_type];
  const Icon = meta.icon;

  async function approve() {
    if (loading) return;
    setLoading("approve");
    try {
      const res = await fetch(
        `/api/admin/ai-actions/${request.id}/approve`,
        { method: "POST" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(`Erro: ${d.error ?? res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function reject() {
    if (loading) return;
    if (!confirm(`Rejeitar essa ação? Vai pro histórico mas não roda.`)) return;
    setLoading("reject");
    try {
      const res = await fetch(
        `/api/admin/ai-actions/${request.id}/reject`,
        { method: "POST" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(`Erro: ${d.error ?? res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  // Snippet de contexto pra exibir
  const contextPreview =
    typeof request.context?.transcript_preview === "string"
      ? `"${(request.context.transcript_preview as string).slice(0, 80)}…"`
      : typeof request.context?.body_preview === "string"
        ? `"${(request.context.body_preview as string).slice(0, 60)}…"`
        : typeof request.context?.video_url === "string"
          ? request.context.video_url as string
          : null;

  return (
    <li className="px-5 py-3 flex items-start justify-between gap-3 hover:bg-black/15 transition-colors">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div
          className="shrink-0 mt-0.5 grid place-items-center w-7 h-7 rounded-full"
          style={{
            background: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
            border: `1px solid color-mix(in srgb, ${meta.color} 35%, transparent)`,
          }}
        >
          <Icon size={13} strokeWidth={1.8} style={{ color: meta.color }} />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-[13px] font-medium text-text">{meta.label}</div>
          <div className="text-[11px] text-text-3 leading-relaxed">
            {meta.desc}
          </div>
          {contextPreview && (
            <div className="text-[10px] text-text-3 mono mt-0.5 truncate max-w-[480px]">
              {contextPreview}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="mono text-[12px] font-medium text-text-2">
          ${request.cost_estimate_usd.toFixed(3)}
        </span>
        <button
          type="button"
          onClick={reject}
          disabled={loading !== null}
          title="Rejeitar"
          className="
            grid place-items-center w-7 h-7 rounded-full
            border border-[var(--border-default)] text-text-3
            hover:text-[var(--error)] hover:border-[var(--error)]
            hover:bg-[color-mix(in_srgb,var(--error)_8%,transparent)]
            transition-colors disabled:opacity-50
          "
        >
          {loading === "reject" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <X size={11} strokeWidth={2} />
          )}
        </button>
        <button
          type="button"
          onClick={approve}
          disabled={loading !== null}
          title="Aprovar"
          className="
            grid place-items-center w-7 h-7 rounded-full
            border border-[var(--accent)] text-[var(--accent)]
            hover:bg-[var(--accent)] hover:text-black
            transition-colors disabled:opacity-50
          "
        >
          {loading === "approve" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Check size={11} strokeWidth={2.5} />
          )}
        </button>
      </div>
    </li>
  );
}
