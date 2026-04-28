"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Toast system — provider + hook + component
// ─────────────────────────────────────────────────────────────

export type ToastKind = "success" | "error" | "info";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  /** Ms antes de sumir. Default 4000. Pass 0 pra não auto-dismissar. */
  duration?: number;
  /** Botão opcional de ação */
  action?: {
    label: string;
    onClick: () => void;
  };
};

type ToastContextValue = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timeoutsRef.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const duration = t.duration ?? 4000;
      setToasts((prev) => [...prev, { ...t, id }]);
      if (duration > 0) {
        const handle = setTimeout(() => {
          dismiss(id);
        }, duration);
        timeoutsRef.current.set(id, handle);
      }
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    return () => {
      for (const h of timeoutsRef.current.values()) clearTimeout(h);
      timeoutsRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback — se provider não tá montado, não crasha, só loga
    return {
      toast: (t: Omit<Toast, "id">) => {
        console.warn("ToastProvider not mounted — toast lost:", t);
        return "";
      },
      dismiss: (_id: string) => {},
    };
  }
  return {
    toast: ctx.push,
    dismiss: ctx.dismiss,
  };
}

// ─────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────

function Toaster() {
  const ctx = useContext(ToastContext);
  if (!ctx) return null;

  return (
    <div
      className="
        fixed z-[100] right-4 bottom-4
        flex flex-col gap-2 items-end
        pointer-events-none
        max-w-[calc(100vw-2rem)]
      "
      aria-live="polite"
      aria-atomic="false"
    >
      {ctx.toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => ctx.dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const config = {
    success: {
      icon: <CheckCircle2 size={15} strokeWidth={2} />,
      color: "var(--success)",
    },
    error: {
      icon: <AlertCircle size={15} strokeWidth={2} />,
      color: "var(--error)",
    },
    info: {
      icon: <Info size={15} strokeWidth={2} />,
      color: "var(--text-2)",
    },
  }[toast.kind];

  return (
    <div
      role="status"
      className="
        glass rounded-[var(--r-md)]
        min-w-[280px] max-w-[420px]
        px-4 py-3 flex items-start gap-3
        pointer-events-auto
        animate-[toast-in_0.28s_cubic-bezier(0.2,0.8,0.2,1)]
      "
      style={{
        boxShadow:
          "0 16px 48px -12px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)",
        borderLeft: `3px solid ${config.color}`,
      }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: config.color }}>
        {config.icon}
      </span>
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <div className="text-[13px] font-medium text-text leading-tight">
          {toast.title}
        </div>
        {toast.description && (
          <div className="text-[12px] text-text-2 leading-snug break-words">
            {toast.description}
          </div>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
            className="
              mt-1.5 self-start text-[12px] font-medium
              underline-offset-2 hover:underline
            "
            style={{ color: config.color }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar"
        className="
          shrink-0 w-5 h-5 grid place-items-center rounded-full
          text-text-3 hover:text-text hover:bg-[var(--bg-glass)]
          transition-colors
        "
      >
        <X size={12} strokeWidth={1.8} />
      </button>
    </div>
  );
}
