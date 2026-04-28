"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Key,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Clock,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/ui/toaster";

type TokenStatus = {
  configured: boolean;
  source: "database" | "env" | "none";
  token_preview: string | null;
  expires_at: string | null;
  days_until_expiry: number | null;
  last_validated_at: string | null;
  last_error: string | null;
  invalid_since: string | null;
};

export function TokenCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [loading, setLoading] = useState<null | "load" | "validate" | "save" | "exchange">("load");
  const [mode, setMode] = useState<"set" | "exchange">("exchange");
  const [input, setInput] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/meta-api/token", { cache: "no-store" });
      const data = await res.json();
      setStatus(data);
    } catch {
      /* silent */
    } finally {
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function validate() {
    setLoading("validate");
    try {
      const res = await fetch("/api/admin/meta-api/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "validate" }),
      });
      const data = await res.json();
      if (data.ok && data.valid) {
        toast({
          kind: "success",
          title: "Token saudável ✓",
          description: `Identidade: ${data.name ?? data.id ?? "?"}`,
        });
      } else {
        toast({
          kind: "error",
          title: "Token inválido",
          description: data.error ?? "Meta rejeitou o token",
        });
      }
      await fetchStatus();
    } catch (err) {
      toast({
        kind: "error",
        title: "Erro ao validar",
        description: err instanceof Error ? err.message : "erro",
      });
      setLoading(null);
    }
  }

  async function submitToken() {
    if (!input.trim()) {
      toast({ kind: "error", title: "Cole o token primeiro" });
      return;
    }
    setLoading(mode === "exchange" ? "exchange" : "save");
    try {
      const payload =
        mode === "exchange"
          ? { action: "exchange", short_token: input.trim() }
          : { action: "set", token: input.trim() };
      const res = await fetch("/api/admin/meta-api/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({
          kind: "error",
          title: "Não consegui salvar",
          description: data.message ?? data.error ?? "erro desconhecido",
        });
      } else if (mode === "exchange" && data.expires_in_days) {
        toast({
          kind: "success",
          title: "Token trocado com sucesso",
          description: `Novo token válido por ~${data.expires_in_days} dias.`,
        });
        setInput("");
        await fetchStatus();
      } else {
        toast({
          kind: "success",
          title: "Token salvo",
          description: "Worker usa o novo em até 30s.",
        });
        setInput("");
        await fetchStatus();
      }
    } catch (err) {
      toast({
        kind: "error",
        title: "Erro",
        description: err instanceof Error ? err.message : "erro",
      });
    } finally {
      setLoading(null);
    }
  }

  const tone = getTone(status);

  return (
    <div
      className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-4"
      style={{
        borderLeft: `3px solid ${tone.color}`,
      }}
    >
      {/* Header com status */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full grid place-items-center shrink-0"
            style={{
              background: `color-mix(in srgb, ${tone.color} 14%, transparent)`,
              color: tone.color,
            }}
          >
            {tone.icon}
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="display text-[16px] font-semibold text-text tracking-[-0.01em] flex items-center gap-2">
              Token da Meta API
              <span
                className="text-[10.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color: tone.color,
                  background: `color-mix(in srgb, ${tone.color} 14%, transparent)`,
                }}
              >
                {tone.label}
              </span>
            </h2>
            <p className="text-[12px] text-text-2">{tone.description}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={validate}
          disabled={loading !== null || !status?.configured}
          className="
            inline-flex items-center gap-1.5 h-8 px-3 rounded-full
            text-[11.5px] font-medium text-text-2
            glass-light hover:bg-[var(--bg-glass-hover)]
            transition-colors disabled:opacity-50
          "
          title="Testa o token atual contra a Meta"
        >
          {loading === "validate" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <ShieldCheck size={11} strokeWidth={1.8} />
          )}
          Validar agora
        </button>
      </div>

      {/* Metadados do token atual */}
      {status && status.configured && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11.5px]">
          <MetaCell
            label="Token"
            value={status.token_preview ?? "—"}
            mono
          />
          <MetaCell
            label="Fonte"
            value={status.source === "database" ? "Banco (editável)" : status.source === "env" ? ".env (fallback)" : "—"}
          />
          <MetaCell
            label="Expira em"
            value={
              status.days_until_expiry !== null
                ? `${status.days_until_expiry} dia${status.days_until_expiry === 1 ? "" : "s"}`
                : "não informado"
            }
            valueColor={
              status.days_until_expiry !== null && status.days_until_expiry < 7
                ? "var(--error)"
                : undefined
            }
          />
          <MetaCell
            label="Última validação"
            value={
              status.last_validated_at
                ? formatRelative(status.last_validated_at)
                : "nunca"
            }
          />
        </div>
      )}

      {/* Último erro (se houver) */}
      {status?.last_error && (
        <div
          className="rounded-[var(--r-sm)] px-3 py-2 flex items-start gap-2"
          style={{
            background: "color-mix(in srgb, var(--error) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--error) 22%, transparent)",
          }}
        >
          <AlertTriangle
            size={13}
            strokeWidth={2}
            className="mt-0.5 shrink-0"
            style={{ color: "var(--error)" }}
          />
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--error)]">
              Último erro da Meta
            </div>
            <p className="text-[12px] text-text mono break-all">
              {status.last_error}
            </p>
          </div>
        </div>
      )}

      {/* Formulário pra trocar/cadastrar token */}
      <div
        className="rounded-[var(--r-md)] p-4 flex flex-col gap-3 border"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border-hairline)",
        }}
      >
        <div className="flex items-center gap-1 p-0.5 rounded-full glass-light border border-[var(--border-hairline)] w-fit">
          <ModeBtn
            active={mode === "exchange"}
            onClick={() => setMode("exchange")}
          >
            <Zap size={11} strokeWidth={2} />
            Trocar por long-lived (60d)
          </ModeBtn>
          <ModeBtn
            active={mode === "set"}
            onClick={() => setMode("set")}
          >
            <Key size={11} strokeWidth={2} />
            Colar token pronto
          </ModeBtn>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wider text-text-3 font-semibold">
            {mode === "exchange"
              ? "Cole aqui o token CURTO (2h) do Graph API Explorer"
              : "Cole aqui o token pronto (ex: System User ou já long-lived)"}
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="EAA..."
            rows={3}
            spellCheck={false}
            className="
              w-full rounded-[var(--r-sm)] px-3 py-2.5
              text-[11.5px] mono
              bg-[var(--bg-glass)] border border-[var(--border-hairline)]
              text-text placeholder:text-text-3
              focus:outline-none focus:border-[var(--accent)]
              resize-none
            "
          />
          <p className="text-[11px] text-text-3">
            {mode === "exchange"
              ? "O sistema vai trocar pelo long-lived (60 dias) usando seu App ID + Secret e salvar no banco."
              : "Token salvo direto. Use esse modo se já tiver um System User Token ou já fez o exchange."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={submitToken}
            disabled={loading !== null || !input.trim()}
            className="
              inline-flex items-center gap-2 h-9 px-4 rounded-full
              bg-[var(--accent)] text-black font-semibold text-[13px]
              hover:scale-[1.02] hover:-translate-y-[1px]
              active:scale-[0.97]
              transition-[transform,opacity]
              disabled:opacity-50 disabled:cursor-not-allowed
              disabled:hover:scale-100 disabled:hover:translate-y-0
            "
          >
            {loading === "exchange" || loading === "save" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : mode === "exchange" ? (
              <Zap size={13} strokeWidth={2} />
            ) : (
              <Key size={13} strokeWidth={2} />
            )}
            {mode === "exchange" ? "Trocar e salvar" : "Salvar token"}
          </button>
          {input && (
            <button
              type="button"
              onClick={() => setInput("")}
              disabled={loading !== null}
              className="text-[12px] text-text-3 hover:text-text px-3"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Ajuda */}
      <details className="text-[12px] text-text-2">
        <summary className="cursor-pointer text-[11.5px] text-text-3 hover:text-text-2 select-none">
          Como gerar o token curto? ↓
        </summary>
        <ol className="mt-2 pl-5 flex flex-col gap-1 list-decimal">
          <li>
            Abre{" "}
            <a
              href="https://developers.facebook.com/tools/explorer/1498058201904365/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              Graph API Explorer
            </a>
          </li>
          <li>Seleciona app <strong>&quot;BB Swipe&quot;</strong> + tipo <strong>&quot;User Token&quot;</strong></li>
          <li>Adiciona permission <strong>public_profile</strong> (só isso)</li>
          <li>Clica <strong>&quot;Generate Access Token&quot;</strong> e aceita</li>
          <li>Copia o token (EAA...) e cola acima no modo &quot;Trocar por long-lived&quot;</li>
        </ol>
      </details>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getTone(status: TokenStatus | null): {
  label: string;
  description: string;
  color: string;
  icon: React.ReactNode;
} {
  if (!status) {
    return {
      label: "Carregando",
      description: "Buscando status do token...",
      color: "var(--text-3)",
      icon: <Loader2 size={16} className="animate-spin" />,
    };
  }
  if (!status.configured) {
    return {
      label: "Não configurado",
      description: "Nenhum token salvo. Cole um pra começar.",
      color: "var(--error)",
      icon: <AlertTriangle size={16} strokeWidth={1.8} />,
    };
  }
  if (status.invalid_since) {
    return {
      label: "Inválido",
      description: "Meta rejeitou — precisa trocar.",
      color: "var(--error)",
      icon: <AlertTriangle size={16} strokeWidth={1.8} />,
    };
  }
  if (status.days_until_expiry !== null && status.days_until_expiry < 7) {
    return {
      label: "Expirando",
      description: `Troca nos próximos ${status.days_until_expiry} dia${status.days_until_expiry === 1 ? "" : "s"}.`,
      color: "#F59E0B",
      icon: <Clock size={16} strokeWidth={1.8} />,
    };
  }
  return {
    label: "Saudável",
    description: status.days_until_expiry
      ? `Válido por mais ${status.days_until_expiry} dias.`
      : "Token configurado e funcionando.",
    color: "var(--success)",
    icon: <CheckCircle2 size={16} strokeWidth={1.8} />,
  };
}

function MetaCell({
  label,
  value,
  mono = false,
  valueColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] uppercase tracking-wider text-text-3 font-semibold">
        {label}
      </span>
      <span
        className={`text-text font-medium truncate ${mono ? "mono text-[11.5px]" : ""}`}
        style={valueColor ? { color: valueColor } : undefined}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`
        inline-flex items-center gap-1.5 px-3 h-7 rounded-full
        text-[11px] font-medium
        transition-colors duration-[var(--dur-2)]
        ${
          active
            ? "text-text bg-[var(--bg-glass)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            : "text-text-3 hover:text-text-2"
        }
      `}
    >
      {children}
    </button>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min atrás`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h atrás`;
  return `${Math.floor(hr / 24)}d atrás`;
}
