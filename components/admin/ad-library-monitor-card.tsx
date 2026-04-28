"use client";

import { useEffect, useState } from "react";
import {
  Radar,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  Search,
} from "lucide-react";

type MonitoredPage = {
  id: string;
  url: string;
  title: string | null;
  meta_page_id: string | null;
  visible: boolean;
  display_order: number;
  screenshot_url: string | null;
  fetched_at: string | null;
  created_at: string;
};

/**
 * Card no admin edit pra gerenciar URLs de Ad Library que o worker diário
 * está monitorando pra a oferta.
 *
 * Features:
 *   - Lista pages type='ad_library' com meta_page_id + visibilidade
 *   - Adicionar URL nova (extrai page_id automaticamente + enfileira refresh)
 *   - Remover page (worker para de monitorar)
 *   - Toggle visibilidade (esconde do público mas mantém monitorando)
 *   - Indicador visual quando worker descobriu via domain search
 */
export function AdLibraryMonitorCard({
  offerId,
  offerSlug,
  lastRefreshedAt,
  refreshIntervalHours,
  adCount,
}: {
  offerId: string;
  offerSlug: string;
  lastRefreshedAt: string | null;
  refreshIntervalHours: number | null;
  adCount: number | null;
}) {
  const [pages, setPages] = useState<MonitoredPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function fetchPages() {
    try {
      const res = await fetch(`/api/admin/offers/${offerId}/monitored-pages`);
      const json = await res.json();
      if (res.ok) {
        setPages(json.pages ?? []);
        setErr(null);
      } else {
        setErr(json.error ?? "load_failed");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId]);

  async function addPage() {
    if (!newUrl.trim() || adding) return;
    setAdding(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/offers/${offerId}/monitored-pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.message ?? json.error ?? "failed");
        return;
      }
      setNewUrl("");
      setSuccessMsg(
        json.page?.meta_page_id
          ? `✅ Page ${json.page.meta_page_id} adicionada · refresh em fila`
          : "✅ URL adicionada · refresh em fila"
      );
      setTimeout(() => setSuccessMsg(null), 4000);
      await fetchPages();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function removePage(pageId: string) {
    if (!confirm("Remover essa URL do monitoramento? O worker vai parar de checar.")) return;
    try {
      const res = await fetch(`/api/admin/pages/${pageId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErr(json.error ?? "delete_failed");
        return;
      }
      setPages((prev) => prev.filter((p) => p.id !== pageId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleVisibility(page: MonitoredPage) {
    try {
      const res = await fetch(`/api/admin/pages/${page.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visible: !page.visible }),
      });
      if (res.ok) {
        setPages((prev) =>
          prev.map((p) =>
            p.id === page.id ? { ...p, visible: !p.visible } : p
          )
        );
      }
    } catch {
      // silent
    }
  }

  async function triggerRefresh() {
    try {
      await fetch(`/api/admin/offers/${offerId}/refresh`, { method: "POST" });
      setSuccessMsg("⟳ Refresh enfileirado com priority=100");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      // silent
    }
  }

  const [discovering, setDiscovering] = useState(false);
  async function triggerDiscover() {
    if (discovering) return;
    setDiscovering(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/offers/${offerId}/discover-pages`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setErr(data.message ?? data.error ?? "failed");
        return;
      }
      setSuccessMsg(
        "🔍 Descoberta enfileirada · worker vai escanear por domínio. Pages novas aparecem em segundos."
      );
      // Re-fetch depois de 8s pra pegar novas pages descobertas
      setTimeout(async () => {
        await fetchPages();
        setSuccessMsg(null);
      }, 8000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscovering(false);
    }
  }

  const totalMonitored = pages.length;
  const visibleCount = pages.filter((p) => p.visible).length;
  const discoveredViaDomain = pages.filter((p) =>
    p.title?.includes("descoberta via")
  ).length;

  return (
    <section className="glass rounded-[var(--r-lg)] p-5 md:p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Radar size={13} strokeWidth={2} className="text-[#06B6D4]" />
            <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em]">
              Monitoramento diário · Spy Engine
            </div>
          </div>
          <h2 className="display text-[18px] font-semibold tracking-[-0.02em]">
            URLs de Ad Library monitoradas
          </h2>
          <p className="text-[12px] text-text-3 mt-1 max-w-[620px]">
            Worker faz refresh a cada{" "}
            <span className="mono text-text-2">
              {refreshIntervalHours ?? 24}h
            </span>{" "}
            pra contar ads ativos. Multi-Page advertisers (2+ FB Pages) somam
            todas. Descoberta automática via domain search roda 1×/semana.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={triggerDiscover}
            disabled={discovering}
            className="
              inline-flex items-center gap-1.5 px-3 py-2 rounded-full
              text-[12px] font-medium
              border transition-colors
              disabled:opacity-60 disabled:cursor-not-allowed
            "
            style={{
              borderColor: "color-mix(in srgb, #06B6D4 40%, transparent)",
              background: "color-mix(in srgb, #06B6D4 8%, transparent)",
              color: "#67E8F9",
            }}
            title="Busca Pages novas via domínio (usa main_site URL)"
          >
            {discovering ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Search size={12} strokeWidth={1.8} />
                Descobrir pages
              </>
            )}
          </button>
          <button
            type="button"
            onClick={triggerRefresh}
            className="
              inline-flex items-center gap-1.5 px-3 py-2 rounded-full
              border border-[var(--border-default)] text-[12px] font-medium
              text-text-2 hover:text-text hover:border-[var(--border-strong)]
              hover:bg-[var(--bg-glass)] transition-colors
            "
            title="Enfileira refresh_ad_count com priority=100"
          >
            <RefreshCw size={12} strokeWidth={1.8} />
            Refresh agora
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <Stat label="Pages monitoradas" value={String(totalMonitored)} />
        <Stat label="Ads ativos (total)" value={(adCount ?? 0).toLocaleString("pt-BR")} />
        <Stat label="Último refresh" value={lastRefreshedAt ? formatRelative(lastRefreshedAt) : "nunca"} />
        <Stat
          label="Auto-descobertas"
          value={discoveredViaDomain > 0 ? `${discoveredViaDomain}` : "—"}
          tone={discoveredViaDomain > 0 ? "accent" : "muted"}
        />
      </div>

      {/* Error banner */}
      {err && (
        <div
          className="rounded-[var(--r-sm)] px-3 py-2 text-[12px] flex items-center gap-2"
          style={{
            background: "color-mix(in srgb, var(--error) 10%, transparent)",
            color: "var(--error)",
            border: "1px solid color-mix(in srgb, var(--error) 30%, transparent)",
          }}
        >
          <AlertTriangle size={12} />
          {err}
          <button
            type="button"
            onClick={() => setErr(null)}
            className="ml-auto text-[10px] underline"
          >
            ok
          </button>
        </div>
      )}

      {/* Success banner */}
      {successMsg && (
        <div
          className="rounded-[var(--r-sm)] px-3 py-2 text-[12px]"
          style={{
            background: "color-mix(in srgb, var(--success) 10%, transparent)",
            color: "var(--success)",
            border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Add new URL — usa div em vez de form pra evitar nested <form>
          dentro do <form> principal do admin edit (HTML não permite) */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newUrl.trim() && !adding) {
              e.preventDefault();
              e.stopPropagation();
              addPage();
            }
          }}
          placeholder="https://www.facebook.com/ads/library/?view_all_page_id=..."
          disabled={adding}
          className="
            flex-1 min-w-[280px]
            h-10 px-3 text-[13px] mono
            rounded-[var(--r-sm)] border border-[var(--border-hairline)]
            bg-[var(--bg-elevated)] text-text
            placeholder:text-text-3
            focus:outline-none focus:border-[var(--border-strong)]
            disabled:opacity-60
          "
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (newUrl.trim() && !adding) addPage();
          }}
          disabled={adding || !newUrl.trim()}
          className="
            inline-flex items-center gap-1.5 h-10 px-4 rounded-[var(--r-sm)]
            bg-[var(--accent)] text-black text-[12.5px] font-semibold
            hover:opacity-90 transition-opacity
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {adding ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Adicionando...
            </>
          ) : (
            <>
              <Plus size={13} strokeWidth={2.4} />
              Adicionar URL
            </>
          )}
        </button>
      </div>
      <p className="text-[10.5px] text-text-3 -mt-2">
        Cola URL direto do Ad Library. Worker extrai o page_id
        (<span className="mono">view_all_page_id</span>) automaticamente e enfileira
        refresh imediato com priority alta.
      </p>

      {/* List of monitored pages */}
      <div className="border-t border-[var(--border-hairline)] pt-4">
        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-text-3 py-2">
            <Loader2 size={12} className="animate-spin" />
            Carregando pages monitoradas...
          </div>
        ) : pages.length === 0 ? (
          <div className="text-[13px] text-text-3 py-2">
            Nenhuma URL sendo monitorada. Cola uma URL de Ad Library acima pra
            começar.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {pages.map((p) => (
              <PageRow
                key={p.id}
                page={p}
                onRemove={() => removePage(p.id)}
                onToggleVisible={() => toggleVisibility(p)}
              />
            ))}
          </div>
        )}
      </div>

      {totalMonitored > 0 && (
        <div className="text-[10.5px] text-text-3">
          {totalMonitored} page{totalMonitored === 1 ? "" : "s"} monitoradas ·{" "}
          {visibleCount} visível{visibleCount === 1 ? "" : "eis"} no público
          {discoveredViaDomain > 0 && (
            <span className="ml-2 text-[#06B6D4]">
              · {discoveredViaDomain} descoberta{discoveredViaDomain === 1 ? "" : "s"} automaticamente
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function PageRow({
  page,
  onRemove,
  onToggleVisible,
}: {
  page: MonitoredPage;
  onRemove: () => void;
  onToggleVisible: () => void;
}) {
  const isDiscovered = page.title?.includes("descoberta via");

  return (
    <div
      className={`
        group flex items-center gap-2 px-3 py-2 rounded-[var(--r-sm)]
        border border-[var(--border-hairline)]
        ${page.visible ? "bg-[var(--bg-elevated)]/50" : "bg-[var(--bg-elevated)]/20 opacity-60"}
        hover:bg-[var(--bg-elevated)] transition-colors
      `}
    >
      {/* Page ID badge */}
      {page.meta_page_id ? (
        <span
          className="inline-flex items-center gap-1 mono text-[10.5px] tabular-nums px-1.5 py-0.5 rounded shrink-0"
          style={{
            background: isDiscovered
              ? "color-mix(in srgb, #06B6D4 14%, transparent)"
              : "var(--bg-glass)",
            color: isDiscovered ? "#67E8F9" : "var(--text-2)",
          }}
          title={isDiscovered ? "Descoberta via domain search automático" : "Adicionada manualmente"}
        >
          {isDiscovered && <Radar size={9} strokeWidth={2} />}
          {page.meta_page_id}
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded shrink-0"
          style={{
            background: "color-mix(in srgb, #F59E0B 14%, transparent)",
            color: "#F59E0B",
          }}
          title="URL não tem view_all_page_id reconhecível"
        >
          <AlertTriangle size={9} />
          sem page_id
        </span>
      )}

      {/* URL (clickable) */}
      <a
        href={page.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 text-[12px] text-text-2 hover:text-text truncate mono"
        title={page.url}
      >
        {page.url.replace(/^https?:\/\/(www\.)?/, "")}
      </a>

      {/* Last fetched indicator */}
      {page.fetched_at && (
        <span
          className="hidden md:inline mono text-[10px] text-text-3 tabular-nums shrink-0"
          title={`Último screenshot: ${new Date(page.fetched_at).toLocaleString("pt-BR")}`}
        >
          {formatRelative(page.fetched_at)}
        </span>
      )}

      {page.screenshot_url && (
        <Check
          size={11}
          strokeWidth={2.4}
          className="text-[var(--success)] shrink-0"
          aria-label="Screenshot capturado"
        />
      )}

      {/* Toggle visibility */}
      <button
        type="button"
        onClick={onToggleVisible}
        className="p-1 text-text-3 hover:text-text transition-colors"
        aria-label={page.visible ? "Ocultar do público" : "Mostrar pro público"}
        title={page.visible ? "Visível no público · clique pra ocultar" : "Oculto no público · clique pra mostrar"}
      >
        {page.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>

      {/* External link */}
      <a
        href={page.url}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1 text-text-3 hover:text-text transition-colors"
        aria-label="Abrir Ad Library"
      >
        <ExternalLink size={12} />
      </a>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-text-3 hover:text-[var(--error)] transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Remover do monitoramento"
        title="Remover — worker para de checar"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "muted";
}) {
  const color =
    tone === "accent"
      ? "#67E8F9"
      : tone === "muted"
      ? "var(--text-3)"
      : "var(--text)";
  return (
    <div
      className="rounded-[var(--r-sm)] border border-[var(--border-hairline)] px-2.5 py-1.5"
      style={{ background: "var(--bg-elevated)" }}
    >
      <div className="text-[9.5px] uppercase tracking-wider text-text-3 font-semibold">
        {label}
      </div>
      <div
        className="mono tabular-nums text-[13px] font-semibold mt-0.5"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
