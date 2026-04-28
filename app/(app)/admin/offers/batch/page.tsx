"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Check,
  Loader2,
  X,
  Upload,
  Film,
  Layers,
  AlertCircle,
  Link as LinkIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LANGUAGE_LABELS,
  NICHE_LABELS,
  STATUS_LABELS,
  STRUCTURE_LABELS,
  TRAFFIC_LABELS,
  type Niche,
  type Language,
  type OfferStructure,
  type TrafficSource,
} from "@/lib/types";
import {
  uploadVsl,
  getVideoDuration,
  generateVideoThumbnail,
  uploadThumbnail,
} from "@/lib/storage";
import { formatDuration } from "@/lib/utils";
import { useToast } from "@/components/ui/toaster";

// ────────────────────────────────────────────────────────────
// types
// ────────────────────────────────────────────────────────────

type ItemStatus =
  | { kind: "pending" }
  | { kind: "uploading"; pct: number }
  | { kind: "saving" }
  | { kind: "done"; slug: string }
  | { kind: "error"; message: string };

type BatchItem = {
  id: string;
  file: File;
  title: string;
  slug: string;
  urlsText: string; // raw textarea content, 1 URL per line
  thumbDataUrl: string | null;
  duration: number | null;
  status: ItemStatus;
};

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

const inputStyle = `
  w-full px-3 py-2 rounded-[var(--r-sm)]
  bg-black/30 border border-[var(--border-default)]
  text-[13px] text-text placeholder:text-text-3
  transition-[border-color,background] duration-200
  focus:outline-none focus:border-[var(--accent)]
  focus:bg-black/50
`;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleFromFilename(name: string): string {
  const noExt = name.replace(/\.[^.]+$/, "");
  return noExt
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && /^https?:\/\//i.test(l));
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ────────────────────────────────────────────────────────────
// component
// ────────────────────────────────────────────────────────────

export default function BatchOffersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Smart defaults — aplicados a TODOS os offers novos.
  const [niche, setNiche] = useState<Niche>("renda_extra");
  const [language, setLanguage] = useState<Language>("pt-BR");
  const [structure, setOfferStructure] = useState<OfferStructure>("vsl");
  const [trafficSource, setTrafficSource] = useState<TrafficSource>("facebook");
  const [status, setStatus] = useState<"active" | "paused" | "draft">("draft");

  const pendingCount = items.filter(
    (i) => i.status.kind !== "done" && i.status.kind !== "error"
  ).length;
  const doneCount = items.filter((i) => i.status.kind === "done").length;
  const errorCount = items.filter((i) => i.status.kind === "error").length;

  async function addFiles(files: File[]) {
    const valid = files.filter((f) =>
      f.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(f.name)
    );
    if (valid.length === 0) return;

    const newItems: BatchItem[] = valid.map((f) => ({
      id: makeId(),
      file: f,
      title: titleFromFilename(f.name),
      slug: slugify(titleFromFilename(f.name)),
      urlsText: "",
      thumbDataUrl: null,
      duration: null,
      status: { kind: "pending" },
    }));
    setItems((prev) => [...prev, ...newItems]);

    // Em paralelo: gera thumbs + duração pra cada item novo
    for (const it of newItems) {
      (async () => {
        try {
          const [dur, thumbBlob] = await Promise.all([
            getVideoDuration(it.file).catch(() => null),
            generateVideoThumbnail(it.file, 3).catch(() => null),
          ]);
          const thumbUrl = thumbBlob ? URL.createObjectURL(thumbBlob) : null;
          setItems((prev) =>
            prev.map((p) =>
              p.id === it.id ? { ...p, duration: dur ?? null, thumbDataUrl: thumbUrl } : p
            )
          );
        } catch {
          // ignora — apenas não exibe thumb
        }
      })();
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) addFiles(files);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) addFiles(files);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.thumbDataUrl) URL.revokeObjectURL(item.thumbDataUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  function updateItem(id: string, patch: Partial<BatchItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  // Cleanup object URLs ao desmontar
  useEffect(() => {
    return () => {
      items.forEach((i) => {
        if (i.thumbDataUrl) URL.revokeObjectURL(i.thumbDataUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processItem(item: BatchItem) {
    // 1. thumb upload (best-effort)
    let thumbPath: string | null = null;
    try {
      const thumbBlob = await generateVideoThumbnail(item.file, 3);
      thumbPath = await uploadThumbnail(item.slug, thumbBlob);
    } catch (err) {
      console.warn(`thumb falhou pra ${item.slug}:`, err);
    }

    // 2. mp4 upload
    updateItem(item.id, { status: { kind: "uploading", pct: 0 } });
    const { path, sizeBytes } = await uploadVsl(
      item.slug,
      item.file,
      (pct) => updateItem(item.id, { status: { kind: "uploading", pct } })
    );

    // 3. Cria offer
    updateItem(item.id, { status: { kind: "saving" } });
    const urls = parseUrls(item.urlsText);
    const res = await fetch("/api/admin/offers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: item.slug,
        title: item.title,
        niche,
        language,
        structure,
        traffic_source: trafficSource,
        status,
        launched_at: new Date().toISOString().slice(0, 10),
        flags: [],
        vsl_storage_path: path,
        vsl_thumbnail_path: thumbPath,
        vsl_size_bytes: sizeBytes,
        vsl_duration_seconds: item.duration,
        vsl_uploaded_at: new Date().toISOString(),
        pages: urls.map((u) => ({ url: u })),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    const data = (await res.json()) as { offer: { slug: string } };
    updateItem(item.id, { status: { kind: "done", slug: data.offer.slug } });
  }

  async function submitAll() {
    if (items.length === 0 || submitting) return;

    // Validação simples: slug duplicado no próprio batch
    const slugs = items.map((i) => i.slug);
    const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (dupes.length > 0) {
      toast({
        kind: "error",
        title: "Slugs duplicados no lote",
        description: `${[...new Set(dupes)].join(", ")}. Edita os títulos pra diferenciar.`,
        duration: 6000,
      });
      return;
    }

    setSubmitting(true);
    // Reset status dos que não foram done
    setItems((prev) =>
      prev.map((i) =>
        i.status.kind === "done" ? i : { ...i, status: { kind: "pending" } }
      )
    );

    // Sequential — evita saturar banda
    for (const item of items) {
      if (item.status.kind === "done") continue;
      try {
        await processItem(item);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        updateItem(item.id, { status: { kind: "error", message: msg } });
      }
    }

    setSubmitting(false);

    // Se tudo passou, redirect pra listagem
    const allOk = items.every((i) => i.status.kind === "done");
    if (allOk) {
      router.push("/admin/offers");
      router.refresh();
    }
  }

  const totalMB = useMemo(
    () =>
      items.reduce((acc, i) => acc + i.file.size, 0) / 1024 / 1024,
    [items]
  );

  // ──────────────────────────────────────────────────────────
  return (
    <div className="relative z-10 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 max-w-[1100px] mx-auto">
      <Link
        href="/admin/offers"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text transition-colors w-fit"
      >
        <ChevronLeft size={15} strokeWidth={1.8} />
        Voltar pras ofertas
      </Link>

      <header>
        <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1 flex items-center gap-1.5">
          <Layers size={12} strokeWidth={1.8} />
          Admin · Batch
        </div>
        <h1 className="display text-[32px] font-semibold tracking-[-0.035em] leading-tight">
          Subir ofertas em lote
        </h1>
        <p className="text-[13px] text-text-2 mt-2 max-w-[640px]">
          Arrasta vários mp4s de uma vez. Cada um vira uma oferta em draft. Os
          defaults abaixo se aplicam a todos, e você pode editar título/slug/URLs
          individualmente antes de salvar.
        </p>
      </header>

      {/* Smart defaults */}
      <div className="glass rounded-[var(--r-lg)] p-4 md:p-5">
        <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-3">
          Defaults do lote
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-[10px] text-text-3 uppercase tracking-[0.14em] mb-1">
              Nicho
            </label>
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value as Niche)}
              className={inputStyle}
              disabled={submitting}
            >
              {Object.entries(NICHE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-text-3 uppercase tracking-[0.14em] mb-1">
              Estrutura
            </label>
            <select
              value={structure}
              onChange={(e) => setOfferStructure(e.target.value as OfferStructure)}
              className={inputStyle}
              disabled={submitting}
            >
              {Object.entries(STRUCTURE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-text-3 uppercase tracking-[0.14em] mb-1">
              Idioma
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className={inputStyle}
              disabled={submitting}
            >
              {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.flag} {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-text-3 uppercase tracking-[0.14em] mb-1">
              Tráfego
            </label>
            <select
              value={trafficSource}
              onChange={(e) =>
                setTrafficSource(e.target.value as TrafficSource)
              }
              className={inputStyle}
              disabled={submitting}
            >
              {Object.entries(TRAFFIC_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-text-3 uppercase tracking-[0.14em] mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "active" | "paused" | "draft")
              }
              className={inputStyle}
              disabled={submitting}
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !submitting && inputRef.current?.click()}
        className={`
          cursor-pointer rounded-[var(--r-lg)] border-2 border-dashed
          ${dragOver
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-glass)]"}
          transition-[background,border-color] duration-200
          py-12 px-6
          flex flex-col items-center gap-3
        `}
      >
        <Upload size={26} strokeWidth={1.3} className="text-text-2" />
        <div className="text-center">
          <div className="text-[14px] font-medium text-text">
            Arrasta mp4s aqui ou clica pra selecionar
          </div>
          <div className="text-[12px] text-text-3 mt-1">
            Pode soltar vários de uma vez. mp4, mov, webm.
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          multiple
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-[12px] text-text-2">
              <span className="font-medium text-text">
                {items.length} {items.length === 1 ? "oferta" : "ofertas"}
              </span>
              {" · "}
              <span className="mono">{totalMB.toFixed(1)}MB total</span>
              {submitting && (
                <>
                  {" · "}
                  <span className="text-text-3">
                    {doneCount} feitas, {pendingCount} pendente
                    {pendingCount === 1 ? "" : "s"}
                    {errorCount > 0 ? `, ${errorCount} com erro` : ""}
                  </span>
                </>
              )}
            </div>
          </div>

          {items.map((item) => (
            <BatchItemCard
              key={item.id}
              item={item}
              onChange={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
              disabled={submitting}
            />
          ))}
        </div>
      )}

      {/* Footer actions */}
      {items.length > 0 && (
        <div className="sticky bottom-4 z-30 flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            disabled={submitting}
            onClick={() => router.push("/admin/offers")}
            className="
              px-4 py-2.5 rounded-full
              text-[13px] font-medium text-text-2 hover:text-text
              hover:bg-[var(--bg-glass)]
              transition-colors duration-200
              disabled:opacity-50
            "
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={submitting || items.length === 0}
            onClick={submitAll}
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
            {submitting ? (
              <Loader2 size={15} strokeWidth={2} className="animate-spin" />
            ) : (
              <Check size={15} strokeWidth={2} />
            )}
            {submitting
              ? `Processando ${doneCount}/${items.length}...`
              : `Salvar tudo (${items.length})`}
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// item card
// ────────────────────────────────────────────────────────────

function BatchItemCard({
  item,
  onChange,
  onRemove,
  disabled,
}: {
  item: BatchItem;
  onChange: (patch: Partial<BatchItem>) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const urls = parseUrls(item.urlsText);
  const statusKind = item.status.kind;

  return (
    <div
      className={`
        glass-light rounded-[var(--r-md)] p-4
        flex gap-4 items-start
        ${statusKind === "done" ? "border border-[var(--success)]/30" : ""}
        ${statusKind === "error" ? "border border-[var(--error)]/30" : ""}
        transition-colors duration-200
      `}
    >
      {/* Thumb */}
      <div className="shrink-0 w-24 md:w-32 aspect-[16/10] rounded-[var(--r-sm)] bg-[var(--bg-elevated)] overflow-hidden relative grid place-items-center">
        {item.thumbDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbDataUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Film size={18} strokeWidth={1.5} className="text-text-3" />
        )}
        {item.duration ? (
          <span className="absolute bottom-1 right-1 mono text-[9px] font-semibold text-white px-1 py-0.5 rounded tabular-nums bg-black/70">
            {formatDuration(item.duration)}
          </span>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[11px] text-text-3">
          <span className="mono truncate">{item.file.name}</span>
          <span className="text-text-4">·</span>
          <span className="mono">{(item.file.size / 1024 / 1024).toFixed(1)}MB</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-2">
          <input
            value={item.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Título"
            className={inputStyle}
            disabled={disabled || statusKind === "done"}
          />
          <input
            value={item.slug}
            onChange={(e) => onChange({ slug: slugify(e.target.value) })}
            placeholder="slug"
            className={`${inputStyle} mono`}
            disabled={disabled || statusKind === "done"}
          />
        </div>

        <div>
          <label className="text-[10px] text-text-3 uppercase tracking-[0.14em] flex items-center gap-1.5">
            <LinkIcon size={10} strokeWidth={1.8} />
            URLs (1 por linha · Ad Library, FB page, landing)
          </label>
          <textarea
            value={item.urlsText}
            onChange={(e) => onChange({ urlsText: e.target.value })}
            placeholder="https://facebook.com/ads/library/?view_all_page_id=...&#10;https://landing-page.com"
            rows={2}
            className={`${inputStyle} mt-1 resize-y min-h-[52px]`}
            disabled={disabled || statusKind === "done"}
          />
          {urls.length > 0 && (
            <div className="text-[10px] text-text-3 mt-1">
              {urls.length} URL{urls.length === 1 ? "" : "s"} prontas pra enrichment
            </div>
          )}
        </div>

        {/* Status line */}
        <ItemStatusLine status={item.status} />
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled && statusKind !== "done"}
        className="
          shrink-0 p-1.5 rounded-[var(--r-sm)]
          text-text-3 hover:text-text hover:bg-[var(--bg-elevated)]
          transition-colors
          disabled:opacity-30
        "
        aria-label="Remover item"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function ItemStatusLine({ status }: { status: ItemStatus }) {
  if (status.kind === "pending") return null;
  if (status.kind === "uploading") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-text-2">
        <Loader2 size={11} strokeWidth={2} className="animate-spin" />
        Enviando mp4 {status.pct}%
        <div className="flex-1 h-0.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden max-w-[200px]">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-200"
            style={{ width: `${status.pct}%` }}
          />
        </div>
      </div>
    );
  }
  if (status.kind === "saving") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-text-2">
        <Loader2 size={11} strokeWidth={2} className="animate-spin" />
        Salvando oferta…
      </div>
    );
  }
  if (status.kind === "done") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--success)]">
        <Check size={11} strokeWidth={2.5} />
        Oferta criada ·{" "}
        <Link
          href={`/app/${status.slug}`}
          className="underline hover:text-[var(--success)] mono"
        >
          /app/{status.slug}
        </Link>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[var(--error)]">
        <AlertCircle size={11} strokeWidth={2} />
        {status.message}
      </div>
    );
  }
  return null;
}
