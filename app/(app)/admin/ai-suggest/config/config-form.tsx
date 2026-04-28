"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Power,
  Check,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Quote,
  Target,
  Radio,
  Hash,
  Tag,
  DollarSign,
  Eye,
  FileText,
  Thermometer,
  Gauge,
} from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ConfigResponse = {
  config: {
    enabled: boolean;
    enable_title: boolean;
    enable_structure: boolean;
    enable_traffic: boolean;
    enable_summary: boolean;
    enable_tags: boolean;
    enable_price_tier: boolean;
    model: string;
    temperature: number;
    max_tokens: number;
    include_vision: boolean;
    transcript_max_chars: number;
    system_prompt: string | null;
    user_prompt_template: string | null;
    prompt_version: number;
    updated_at: string;
  } | null;
  defaults: {
    system_prompt: string;
    user_prompt_template: string;
  };
};

const MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "gpt-4o-mini · ~$0.003/oferta (default)" },
  { value: "gpt-4o", label: "gpt-4o · ~$0.05/oferta (10× mais caro, mais acurado)" },
  { value: "gpt-4o-mini-2024-07-18", label: "gpt-4o-mini-2024-07-18 (pinned)" },
];

export function ConfigForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [data, setData] = useState<ConfigResponse | null>(null);

  // Form state local
  const [enabled, setEnabled] = useState(true);
  const [fields, setFields] = useState({
    title: true,
    structure: true,
    traffic: true,
    summary: true,
    tags: true,
    priceTier: true,
  });
  const [model, setModel] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(500);
  const [includeVision, setIncludeVision] = useState(true);
  const [transcriptMax, setTranscriptMax] = useState(4000);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPromptTemplate, setUserPromptTemplate] = useState("");
  const [showingSystemDefault, setShowingSystemDefault] = useState(false);
  const [showingUserDefault, setShowingUserDefault] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-suggest/config", {
        cache: "no-store",
      });
      const json = (await res.json()) as ConfigResponse;
      setData(json);
      const cfg = json.config;
      if (cfg) {
        setEnabled(cfg.enabled);
        setFields({
          title: cfg.enable_title,
          structure: cfg.enable_structure,
          traffic: cfg.enable_traffic,
          summary: cfg.enable_summary,
          tags: cfg.enable_tags,
          priceTier: cfg.enable_price_tier,
        });
        setModel(cfg.model);
        setTemperature(Number(cfg.temperature));
        setMaxTokens(cfg.max_tokens);
        setIncludeVision(cfg.include_vision);
        setTranscriptMax(cfg.transcript_max_chars);
        setSystemPrompt(cfg.system_prompt ?? json.defaults.system_prompt);
        setUserPromptTemplate(
          cfg.user_prompt_template ?? json.defaults.user_prompt_template
        );
        setShowingSystemDefault(cfg.system_prompt === null);
        setShowingUserDefault(cfg.user_prompt_template === null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const payload = {
        enabled,
        enable_title: fields.title,
        enable_structure: fields.structure,
        enable_traffic: fields.traffic,
        enable_summary: fields.summary,
        enable_tags: fields.tags,
        enable_price_tier: fields.priceTier,
        model,
        temperature,
        max_tokens: maxTokens,
        include_vision: includeVision,
        transcript_max_chars: transcriptMax,
        // Se texto bate com default → manda null pra voltar ao "usando default"
        system_prompt:
          systemPrompt === data.defaults.system_prompt ? null : systemPrompt,
        user_prompt_template:
          userPromptTemplate === data.defaults.user_prompt_template
            ? null
            : userPromptTemplate,
      };
      const res = await fetch("/api/admin/ai-suggest/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      toast({
        kind: "success",
        title: "Configuração salva",
        description: json.prompt_version_bumped
          ? "Prompts atualizados — worker usa os novos na próxima oferta processada."
          : "Alterações ativas em ~30s (cache do worker).",
      });
      await fetchConfig();
      router.refresh();
    } catch (err) {
      toast({
        kind: "error",
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "erro",
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetPrompts() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai-suggest/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset_prompts" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast({
        kind: "success",
        title: "Prompts restaurados",
        description: "Voltamos pro padrão do código.",
      });
      await fetchConfig();
    } catch (err) {
      toast({
        kind: "error",
        title: "Erro ao restaurar",
        description: err instanceof Error ? err.message : "erro",
      });
    } finally {
      setSaving(false);
      setConfirmReset(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="glass rounded-[var(--r-lg)] p-10 flex items-center gap-3 text-text-2">
        <Loader2 size={18} className="animate-spin" />
        Carregando config...
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* ── Master switch ── */}
        <section
          className="glass rounded-[var(--r-lg)] p-5 flex items-center justify-between gap-4"
          style={{
            borderLeft: `3px solid ${enabled ? "var(--success)" : "var(--error)"}`,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full grid place-items-center shrink-0"
              style={{
                background: `color-mix(in srgb, ${enabled ? "var(--success)" : "var(--error)"} 14%, transparent)`,
                color: enabled ? "var(--success)" : "var(--error)",
              }}
            >
              <Power size={17} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col gap-0.5">
              <h2 className="display text-[16px] font-semibold text-text">
                AI Suggest {enabled ? "ligado" : "desligado"}
              </h2>
              <p className="text-[12px] text-text-2">
                {enabled
                  ? "Worker gera sugestões automaticamente após transcrição de cada oferta nova."
                  : "Worker NÃO chama GPT-4o-mini. Nenhuma sugestão nova é criada até você ligar de volta. Drafts já gerados continuam disponíveis."}
              </p>
            </div>
          </div>
          <Toggle value={enabled} onChange={setEnabled} size="lg" />
        </section>

        {/* ── Campos que a IA preenche ── */}
        <section className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
            <Sparkles size={12} strokeWidth={1.8} />
            Campos que a IA gera
          </div>
          <p className="text-[12px] text-text-2 -mt-1">
            Desligue um campo quando o modelo tá consistentemente errado nele.
            Campos desligados ficam sem sugestão no banner da edit page.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <FieldToggle
              label="Título (gancho)"
              icon={<Quote size={12} strokeWidth={1.8} />}
              value={fields.title}
              onChange={(v) => setFields({ ...fields, title: v })}
              disabled={!enabled}
            />
            <FieldToggle
              label="Estrutura"
              icon={<Target size={12} strokeWidth={1.8} />}
              value={fields.structure}
              onChange={(v) => setFields({ ...fields, structure: v })}
              disabled={!enabled}
            />
            <FieldToggle
              label="Tráfego"
              icon={<Radio size={12} strokeWidth={1.8} />}
              value={fields.traffic}
              onChange={(v) => setFields({ ...fields, traffic: v })}
              disabled={!enabled}
            />
            <FieldToggle
              label="Resumo"
              icon={<Hash size={12} strokeWidth={1.8} />}
              value={fields.summary}
              onChange={(v) => setFields({ ...fields, summary: v })}
              disabled={!enabled}
            />
            <FieldToggle
              label="Tags"
              icon={<Tag size={12} strokeWidth={1.8} />}
              value={fields.tags}
              onChange={(v) => setFields({ ...fields, tags: v })}
              disabled={!enabled}
            />
            <FieldToggle
              label="Price tier"
              icon={<DollarSign size={12} strokeWidth={1.8} />}
              value={fields.priceTier}
              onChange={(v) => setFields({ ...fields, priceTier: v })}
              disabled={!enabled}
            />
          </div>
        </section>

        {/* ── Config técnica ── */}
        <section className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
            <Gauge size={12} strokeWidth={1.8} />
            Parâmetros do modelo
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-3 font-semibold">
                Modelo
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={!enabled || saving}
                className="
                  h-9 px-3 rounded-full glass-light text-[12.5px] text-text
                  border border-[var(--border-hairline)]
                  appearance-none cursor-pointer
                  bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23A1A1A6%22 stroke-width=%221.8%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]
                  bg-no-repeat bg-[right_12px_center] pr-8
                  disabled:opacity-50
                "
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <label className="text-[10.5px] text-text-3">
                Modelo escolhido afeta custo e qualidade.
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-3 font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Thermometer size={10} strokeWidth={1.8} />
                  Temperature
                </span>
                <span className="mono text-[11px] text-text">{temperature.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                disabled={!enabled || saving}
                className="w-full accent-[var(--accent)] disabled:opacity-50"
              />
              <label className="text-[10.5px] text-text-3">
                0 = determinístico · 0.3 = default · 1+ = mais criativo (pode inventar)
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-3 font-semibold">
                Max tokens na resposta
              </label>
              <input
                type="number"
                min={50}
                max={4000}
                step={50}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                disabled={!enabled || saving}
                className="
                  h-9 px-3 rounded-full glass-light text-[12.5px] text-text
                  border border-[var(--border-hairline)]
                  focus:outline-none focus:border-[var(--accent)]
                  disabled:opacity-50
                "
              />
              <label className="text-[10.5px] text-text-3">
                500 cabe JSON com 6 campos + tags. Aumentar só se cortar respostas.
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] uppercase tracking-wider text-text-3 font-semibold flex items-center gap-1.5">
                <FileText size={10} strokeWidth={1.8} />
                Transcrição — máx chars
              </label>
              <input
                type="number"
                min={500}
                max={12000}
                step={500}
                value={transcriptMax}
                onChange={(e) => setTranscriptMax(Number(e.target.value))}
                disabled={!enabled || saving}
                className="
                  h-9 px-3 rounded-full glass-light text-[12.5px] text-text
                  border border-[var(--border-hairline)]
                  focus:outline-none focus:border-[var(--accent)]
                  disabled:opacity-50
                "
              />
              <label className="text-[10.5px] text-text-3">
                4000 cobre gancho + oferta na maioria dos VSLs. Mais chars = mais tokens.
              </label>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--border-hairline)]">
            <FieldToggle
              label="Incluir screenshot da landing (vision)"
              icon={<Eye size={12} strokeWidth={1.8} />}
              value={includeVision}
              onChange={setIncludeVision}
              disabled={!enabled}
              description="Custa ~2× mais mas ajuda classificar estrutura (quiz vs vsl) e price tier."
            />
          </div>
        </section>

        {/* ── System Prompt ── */}
        <section className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
                <Sparkles size={12} strokeWidth={1.8} />
                System prompt
                {showingSystemDefault && (
                  <span
                    className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{
                      color: "var(--text-3)",
                      background: "var(--bg-elevated)",
                    }}
                  >
                    default
                  </span>
                )}
              </div>
              <p className="text-[12px] text-text-2 mt-1 max-w-[620px]">
                Regras gerais pra IA. <strong>Aqui é onde você ajusta o estilo do título</strong>:
                por ex, &quot;título DEVE dizer o nome da oferta, não a promessa&quot;.
              </p>
            </div>
            {!showingSystemDefault && (
              <button
                type="button"
                onClick={() => {
                  setSystemPrompt(data.defaults.system_prompt);
                  setShowingSystemDefault(true);
                }}
                className="
                  inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full
                  text-[11px] text-text-3 hover:text-text
                  transition-colors
                "
              >
                <RefreshCw size={10} strokeWidth={1.8} />
                Restaurar default
              </button>
            )}
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => {
              setSystemPrompt(e.target.value);
              setShowingSystemDefault(e.target.value === data.defaults.system_prompt);
            }}
            disabled={!enabled || saving}
            rows={14}
            spellCheck={false}
            className="
              w-full rounded-[var(--r-sm)] px-3 py-2.5
              mono text-[11.5px] text-text
              bg-[var(--bg-elevated)] border border-[var(--border-hairline)]
              focus:outline-none focus:border-[var(--accent)]
              resize-y disabled:opacity-50
            "
          />
          <p className="text-[10.5px] text-text-3">
            {systemPrompt.length} chars · mudanças aqui sobem a prompt_version.
          </p>
        </section>

        {/* ── User Prompt Template ── */}
        <section className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-3 font-semibold">
                <Sparkles size={12} strokeWidth={1.8} />
                User prompt template
                {showingUserDefault && (
                  <span
                    className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{
                      color: "var(--text-3)",
                      background: "var(--bg-elevated)",
                    }}
                  >
                    default
                  </span>
                )}
              </div>
              <p className="text-[12px] text-text-2 mt-1 max-w-[620px]">
                Template de cada request. Placeholders disponíveis:{" "}
                <code className="mono text-[10.5px] px-1 rounded" style={{ background: "var(--bg-elevated)" }}>
                  {"{title}"}
                </code>{" "}
                <code className="mono text-[10.5px] px-1 rounded" style={{ background: "var(--bg-elevated)" }}>
                  {"{niche}"}
                </code>{" "}
                <code className="mono text-[10.5px] px-1 rounded" style={{ background: "var(--bg-elevated)" }}>
                  {"{domain}"}
                </code>{" "}
                <code className="mono text-[10.5px] px-1 rounded" style={{ background: "var(--bg-elevated)" }}>
                  {"{transcript_trimmed}"}
                </code>{" "}
                <code className="mono text-[10.5px] px-1 rounded" style={{ background: "var(--bg-elevated)" }}>
                  {"{transcript_max_chars}"}
                </code>
              </p>
            </div>
            {!showingUserDefault && (
              <button
                type="button"
                onClick={() => {
                  setUserPromptTemplate(data.defaults.user_prompt_template);
                  setShowingUserDefault(true);
                }}
                className="
                  inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full
                  text-[11px] text-text-3 hover:text-text
                  transition-colors
                "
              >
                <RefreshCw size={10} strokeWidth={1.8} />
                Restaurar default
              </button>
            )}
          </div>
          <textarea
            value={userPromptTemplate}
            onChange={(e) => {
              setUserPromptTemplate(e.target.value);
              setShowingUserDefault(
                e.target.value === data.defaults.user_prompt_template
              );
            }}
            disabled={!enabled || saving}
            rows={18}
            spellCheck={false}
            className="
              w-full rounded-[var(--r-sm)] px-3 py-2.5
              mono text-[11.5px] text-text
              bg-[var(--bg-elevated)] border border-[var(--border-hairline)]
              focus:outline-none focus:border-[var(--accent)]
              resize-y disabled:opacity-50
            "
          />
        </section>

        {/* ── Action bar ── */}
        <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            disabled={saving}
            className="
              inline-flex items-center gap-1.5 h-9 px-3 rounded-full
              text-[12px] font-medium text-text-2 hover:text-text
              hover:bg-[var(--bg-glass)]
              transition-colors disabled:opacity-50
            "
          >
            <AlertTriangle size={12} strokeWidth={1.8} />
            Restaurar prompts ao padrão
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-3">
              Prompt v{data.config?.prompt_version ?? 1}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="
                inline-flex items-center gap-2 h-9 px-5 rounded-full
                bg-[var(--accent)] text-black font-semibold text-[13px]
                hover:scale-[1.02] active:scale-[0.97]
                transition-transform disabled:opacity-50 disabled:hover:scale-100
              "
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} strokeWidth={2.5} />
              )}
              Salvar configuração
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Restaurar prompts ao padrão?"
        description="System prompt e user template voltam ao original do código. As outras configurações (modelo, temperature, toggles) não mudam."
        warning="Suas customizações de prompt serão perdidas."
        confirmLabel="Sim, restaurar"
        cancelLabel="Cancelar"
        tone="warning"
        loading={saving}
        onCancel={() => !saving && setConfirmReset(false)}
        onConfirm={resetPrompts}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Toggle + FieldToggle
// ─────────────────────────────────────────────────────────────

function Toggle({
  value,
  onChange,
  disabled,
  size = "md",
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const w = size === "lg" ? "w-12" : "w-10";
  const h = size === "lg" ? "h-7" : "h-6";
  const dot = size === "lg" ? "w-5 h-5" : "w-4 h-4";
  const translate = size === "lg" ? "translate-x-5" : "translate-x-4";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`
        relative ${w} ${h} rounded-full transition-colors shrink-0
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
      style={{
        background: value
          ? "var(--success)"
          : "color-mix(in srgb, var(--text-3) 30%, transparent)",
      }}
    >
      <span
        aria-hidden="true"
        className={`
          absolute top-1 left-1
          ${dot} bg-white rounded-full shadow-md
          transition-transform duration-200
          ${value ? translate : ""}
        `}
      />
    </button>
  );
}

function FieldToggle({
  label,
  icon,
  value,
  onChange,
  disabled,
  description,
}: {
  label: string;
  icon: React.ReactNode;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <div
      className={`
        flex items-center justify-between gap-3 rounded-[var(--r-sm)] px-3 py-2
        border transition-colors
        ${value ? "" : "opacity-70"}
      `}
      style={{
        background: value
          ? "color-mix(in srgb, var(--accent) 6%, transparent)"
          : "var(--bg-elevated)",
        borderColor: value
          ? "color-mix(in srgb, var(--accent) 24%, transparent)"
          : "var(--border-hairline)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-text-3 shrink-0">{icon}</span>
        <div className="flex flex-col gap-0 min-w-0">
          <span className="text-[12px] font-medium text-text truncate">
            {label}
          </span>
          {description && (
            <span className="text-[10.5px] text-text-3 truncate" title={description}>
              {description}
            </span>
          )}
        </div>
      </div>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}
