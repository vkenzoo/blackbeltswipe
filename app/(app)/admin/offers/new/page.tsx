"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Check, Upload, Film, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  LANGUAGE_LABELS,
  NICHE_LABELS,
  STATUS_LABELS,
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
} from "@/lib/types";
import {
  uploadVsl,
  getVideoDuration,
  generateVideoThumbnail,
  uploadThumbnail,
} from "@/lib/storage";
import { formatDuration } from "@/lib/utils";

const inputStyle = `
  w-full px-3.5 py-2.5 rounded-[var(--r-md)]
  bg-black/30 border border-[var(--border-default)]
  text-[14px] text-text placeholder:text-text-3
  transition-[border-color,background] duration-200
  focus:outline-none focus:border-[var(--accent)]
  focus:bg-black/50 focus:shadow-[0_0_0_4px_var(--accent-soft)]
`;

const labelStyle =
  "block text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-2";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewOfferPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [vslFile, setVslFile] = useState<File | null>(null);
  const [vslDuration, setVslDuration] = useState<number | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setVslFile(f);
    try {
      const dur = await getVideoDuration(f);
      setVslDuration(dur);
    } catch {
      setVslDuration(null);
    }
  }

  function clearFile() {
    setVslFile(null);
    setVslDuration(null);
    setUploadPct(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries()) as Record<string, string>;

    // slug fallback
    const finalSlug = slug || slugify(data.title);

    try {
      // 1. Se tem arquivo VSL, faz upload primeiro
      let vslPayload: Record<string, unknown> = {};
      if (vslFile) {
        // 1a. Gera thumbnail client-side (best effort, não bloqueia upload)
        let thumbPath: string | null = null;
        try {
          const thumbBlob = await generateVideoThumbnail(vslFile, 3);
          thumbPath = await uploadThumbnail(finalSlug, thumbBlob);
        } catch (err) {
          console.warn("thumb gen/upload falhou, seguindo sem thumb:", err);
        }

        // 1b. Upload do mp4 (com progress bar)
        const { path, sizeBytes } = await uploadVsl(
          finalSlug,
          vslFile,
          (pct) => setUploadPct(pct)
        );
        vslPayload = {
          vsl_storage_path: path,
          vsl_thumbnail_path: thumbPath,
          vsl_size_bytes: sizeBytes,
          vsl_duration_seconds: vslDuration,
          vsl_uploaded_at: new Date().toISOString(),
        };
      }

      // 2. Cria oferta
      const res = await fetch("/api/admin/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: finalSlug,
          title: data.title,
          niche: data.niche,
          language: data.language,
          structure: data.structure,
          traffic_source: data.traffic_source,
          status: data.status,
          launched_at: new Date().toISOString().slice(0, 10),
          flags: (data.flags ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          ...vslPayload,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      router.push("/admin/offers");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
    }
  }

  const uploading = status === "submitting" && uploadPct > 0 && uploadPct < 100;

  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-8 max-w-[720px] mx-auto">
      <Link
        href="/admin/offers"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text transition-colors w-fit"
      >
        <ChevronLeft size={15} strokeWidth={1.8} />
        Voltar pras ofertas
      </Link>

      <div>
        <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
          Admin · Nova oferta
        </div>
        <h1 className="display text-[32px] font-semibold tracking-[-0.035em] leading-tight">
          Adicionar oferta
        </h1>
        <p className="text-[13px] text-text-2 mt-2">
          Preenche os dados e (opcional) sobe a VSL em mp4. Enviar sem VSL cria a
          oferta em draft — dá pra subir depois.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className={labelStyle} htmlFor="title">
            Título
          </label>
          <input
            id="title"
            name="title"
            className={inputStyle}
            placeholder="Ex: Quiz Bottrel"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSlug(slugify(e.target.value));
            }}
            required
          />
        </div>

        <div>
          <label className={labelStyle} htmlFor="slug">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            className={`${inputStyle} mono`}
            placeholder="quiz-bottrel"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            required
          />
          <p className="text-[11px] text-text-3 mt-1.5">
            URL final: <span className="mono">/app/{slug || "slug"}</span>
          </p>
        </div>

        <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
          <div>
            <label className={labelStyle} htmlFor="niche">
              Nicho
            </label>
            <select id="niche" name="niche" className={inputStyle} required>
              {Object.entries(NICHE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle} htmlFor="structure">
              Estrutura
            </label>
            <select id="structure" name="structure" className={inputStyle} required>
              {Object.entries(STRUCTURE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle} htmlFor="language">
              Idioma
            </label>
            <select id="language" name="language" className={inputStyle} required>
              {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.flag} {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle} htmlFor="traffic_source">
              Tráfego
            </label>
            <select
              id="traffic_source"
              name="traffic_source"
              className={inputStyle}
              required
            >
              {Object.entries(TRAFFIC_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelStyle}>Status</label>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <label
                key={k}
                className="
                  inline-flex items-center gap-2 px-4 py-2 rounded-full
                  glass-light cursor-pointer
                  text-[13px] font-medium
                  has-[:checked]:bg-[var(--bg-elevated)] has-[:checked]:border-[var(--border-strong)]
                  transition-all duration-200
                "
              >
                <input
                  type="radio"
                  name="status"
                  value={k}
                  defaultChecked={k === "draft"}
                  className="sr-only peer"
                />
                <span className="w-3 h-3 rounded-full border border-[var(--border-strong)] peer-checked:bg-[var(--accent)] peer-checked:border-[var(--accent)] transition-colors" />
                {v}
              </label>
            ))}
          </div>
        </div>

        {/* VSL Upload */}
        <div>
          <label className={labelStyle}>Vídeo da VSL (mp4, opcional)</label>

          {!vslFile ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="
                w-full flex items-center justify-center gap-3 px-5 py-6
                border-2 border-dashed border-[var(--border-default)] rounded-[var(--r-lg)]
                text-[13px] text-text-2 hover:text-text hover:border-[var(--border-strong)]
                hover:bg-[var(--bg-glass)]
                transition-[background,color,border-color] duration-200
              "
            >
              <Upload size={18} strokeWidth={1.5} />
              Clica pra selecionar o arquivo mp4
            </button>
          ) : (
            <div className="glass-light rounded-[var(--r-md)] p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--r-sm)] bg-[var(--bg-elevated)] grid place-items-center shrink-0">
                <Film size={16} strokeWidth={1.5} className="text-text-2" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-text truncate">
                  {vslFile.name}
                </div>
                <div className="text-[11px] text-text-3 mono mt-0.5">
                  {(vslFile.size / 1024 / 1024).toFixed(1)} MB
                  {vslDuration && ` · ${formatDuration(vslDuration)}`}
                  {uploading && ` · enviando ${uploadPct}%`}
                  {uploadPct === 100 && " · upload concluído"}
                </div>
                {uploading && (
                  <div className="mt-2 h-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-200"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                )}
              </div>
              {status !== "submitting" && (
                <button
                  type="button"
                  onClick={clearFile}
                  className="p-2 text-text-3 hover:text-text transition-colors"
                  aria-label="Remover"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={handleFileChange}
          />

          <p className="text-[11px] text-text-3 mt-1.5">
            Upload direto pro Supabase Storage. Max ~2GB. Formatos: mp4, mov, webm.
          </p>
        </div>

        <div>
          <label className={labelStyle} htmlFor="flags">
            Flags (opcional, separadas por vírgula)
          </label>
          <input
            id="flags"
            name="flags"
            className={inputStyle}
            placeholder="escalando, novo, hot"
          />
        </div>

        {status === "error" && (
          <div className="p-3 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--error)_30%,transparent)] bg-[color-mix(in_srgb,var(--error)_8%,transparent)] text-[12px] text-[var(--error)]">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-hairline)]">
          <Link
            href="/admin/offers"
            className="
              px-4 py-2.5 rounded-full
              text-[13px] font-medium text-text-2 hover:text-text
              hover:bg-[var(--bg-glass)]
              transition-colors duration-200
            "
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={status === "submitting"}
            className="
              inline-flex items-center gap-2 px-5 py-2.5 rounded-full
              bg-[var(--accent)] text-black font-medium text-[13px]
              shadow-[0_4px_20px_var(--accent-glow),inset_0_1px_0_rgba(255,255,255,0.4)]
              transition-[transform,box-shadow,opacity] duration-200 ease-[var(--ease-spring)]
              hover:scale-[1.02] hover:-translate-y-[1px]
              active:scale-[0.97]
              disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100
            "
          >
            {status === "submitting" ? (
              <Loader2 size={15} strokeWidth={2} className="animate-spin" />
            ) : (
              <Check size={15} strokeWidth={2} />
            )}
            {status === "submitting"
              ? uploading
                ? `Enviando ${uploadPct}%...`
                : "Criando..."
              : "Criar oferta"}
          </button>
        </div>
      </form>
    </div>
  );
}
