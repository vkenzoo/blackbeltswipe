import { cn } from "@/lib/utils";

type LogoProps = {
  size?: "sm" | "md" | "lg";
  wordmark?: boolean;
  className?: string;
};

const SIZES = {
  sm: { mark: 24, radius: 6, wordmark: "text-[11px]" },
  md: { mark: 28, radius: 7, wordmark: "text-[13px]" },
  lg: { mark: 40, radius: 10, wordmark: "text-lg" },
};

export function Logo({ size = "md", wordmark = true, className }: LogoProps) {
  const cfg = SIZES[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="grid place-items-center font-display font-bold"
        style={{
          width: cfg.mark,
          height: cfg.mark,
          borderRadius: cfg.radius,
          background:
            "linear-gradient(135deg, #F5F5F7 0%, rgba(255,255,255,0.15) 100%)",
          color: "#000",
          fontSize: cfg.mark * 0.5,
          lineHeight: 1,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 12px rgba(255,255,255,0.08)",
        }}
        aria-hidden="true"
      >
        B
      </div>
      {wordmark && (
        <span
          className={cn(
            "font-display font-semibold uppercase tracking-[0.12em] text-text-2",
            cfg.wordmark
          )}
        >
          Black Belt Swipe
        </span>
      )}
    </div>
  );
}
