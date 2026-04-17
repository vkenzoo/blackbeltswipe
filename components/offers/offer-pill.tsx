import { cn } from "@/lib/utils";

type OfferPillProps = {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "niche" | "ghost" | "live";
  size?: "sm" | "md";
  icon?: React.ReactNode;
  dot?: boolean;
  className?: string;
};

const VARIANTS = {
  default:
    "bg-[var(--bg-glass)] border-[var(--border-default)] text-text hover:bg-[var(--bg-glass-hover)] hover:border-[var(--border-strong)]",
  success:
    "bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)]",
  warning:
    "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] border-[color-mix(in_srgb,var(--warning)_20%,transparent)] text-[var(--warning)]",
  error:
    "bg-[color-mix(in_srgb,var(--error)_10%,transparent)] border-[color-mix(in_srgb,var(--error)_20%,transparent)] text-[var(--error)]",
  niche: "bg-transparent border-[var(--border-default)] text-text-2",
  ghost: "bg-transparent border-transparent text-text-3",
  // "escalando agora" — fundo glass com dot verde pulsante, texto branco
  live:
    "bg-[var(--bg-glass)] border-[var(--border-default)] text-text hover:bg-[var(--bg-glass-hover)] hover:border-[var(--border-strong)] pill-live",
};

const SIZES = {
  sm: "px-2.5 py-1 text-[11px] font-medium gap-1.5",
  md: "px-3.5 py-1.5 text-[12px] font-medium gap-2",
};

export function OfferPill({
  children,
  variant = "default",
  size = "md",
  icon,
  dot = false,
  className,
}: OfferPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center border rounded-full whitespace-nowrap transition-[background,border-color,color] duration-200 ease-[var(--ease-standard)]",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {dot && (
        <span
          className="pulse-dot w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            backgroundColor: variant === "live" ? "var(--success)" : "currentColor",
            boxShadow:
              variant === "live"
                ? "0 0 8px var(--success)"
                : "0 0 8px currentColor",
          }}
          aria-hidden="true"
        />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
