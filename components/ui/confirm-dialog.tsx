"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

type Tone = "danger" | "warning" | "info";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  /** Warning extra de ação irreversível (ex: "Esta ação não pode ser desfeita") */
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

const TONE_COLOR: Record<Tone, string> = {
  danger: "var(--error)",
  warning: "#F59E0B",
  info: "var(--accent)",
};

export function ConfirmDialog({
  open,
  title,
  description,
  warning,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const color = TONE_COLOR[tone];
  const cancelRef = useRef<HTMLButtonElement>(null);

  // ESC fecha + foco inicial no cancelar (safer default)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    // body scroll lock
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // foco no cancelar
    setTimeout(() => cancelRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="
        fixed inset-0 z-[90]
        flex items-center justify-center p-4
        animate-[fade-in_0.18s_ease-out]
      "
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.56)", backdropFilter: "blur(4px)" }}
        onClick={() => !loading && onCancel()}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="
          relative glass rounded-[var(--r-lg)]
          w-full max-w-[440px] p-6
          flex flex-col gap-4
          animate-[dialog-in_0.24s_cubic-bezier(0.2,0.8,0.2,1)]
        "
        style={{
          boxShadow:
            "0 40px 96px -20px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {/* Close X */}
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          aria-label="Fechar"
          className="
            absolute top-3 right-3 w-7 h-7 grid place-items-center rounded-full
            text-text-3 hover:text-text hover:bg-[var(--bg-glass-hover)]
            transition-colors disabled:opacity-40
          "
        >
          <X size={14} strokeWidth={1.8} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-full grid place-items-center shrink-0"
            style={{
              background: `color-mix(in srgb, ${color} 14%, transparent)`,
              color,
            }}
          >
            <AlertTriangle size={18} strokeWidth={1.8} />
          </div>
          <div className="flex flex-col gap-1 min-w-0 pt-0.5">
            <h2
              id="confirm-title"
              className="display text-[17px] font-semibold text-text leading-tight"
            >
              {title}
            </h2>
            {description && (
              <p className="text-[13px] text-text-2 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Warning banner */}
        {warning && (
          <div
            className="flex items-start gap-2 rounded-[var(--r-sm)] px-3 py-2.5"
            style={{
              background: `color-mix(in srgb, ${color} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
            }}
          >
            <AlertTriangle
              size={13}
              strokeWidth={2}
              className="mt-0.5 shrink-0"
              style={{ color }}
            />
            <p
              className="text-[12px] font-medium leading-snug"
              style={{ color }}
            >
              {warning}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="
              px-4 py-2 rounded-full text-[13px] font-medium
              text-text-2 hover:text-text hover:bg-[var(--bg-glass-hover)]
              transition-colors disabled:opacity-50
            "
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="
              inline-flex items-center gap-2 px-5 py-2 rounded-full
              text-[13px] font-semibold text-white
              transition-opacity disabled:opacity-60
            "
            style={{
              background: color,
            }}
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {loading ? "Processando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
