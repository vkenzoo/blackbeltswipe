import { cn } from "@/lib/utils";

type LogoProps = {
  size?: "sm" | "md" | "lg";
  /** Mostra o wordmark "BlackBelt / SWIPE" ao lado da marca. Default: true. */
  wordmark?: boolean;
  /** Inverte cores — square preto com T-mark branco. Default dark = square branco, T preto. */
  variant?: "dark" | "light";
  className?: string;
};

const SIZES = {
  sm: { mark: 28, radius: 7, gap: 10, row1: 14, swipe: 9 },
  md: { mark: 40, radius: 10, gap: 12, row1: 20, swipe: 10.5 },
  lg: { mark: 64, radius: 16, gap: 16, row1: 32, swipe: 13 },
};

/**
 * BlackBelt Swipe — logo oficial do brandbook
 *
 * Marca: squircle (border-radius ~24%) com T-mark geométrico
 * formado por 4 paths (2 triangulos superiores + 2 hastes diagonais).
 *
 * Wordmark: "Black" bold + "Belt" regular na primeira linha,
 * "SWIPE" uppercase com letter-spacing 0.42em na segunda.
 *
 * Paths extraídos do SVG oficial (Frame 56 (1).svg), normalizados
 * pra viewBox 0-100.
 */
export function Logo({
  size = "md",
  wordmark = true,
  variant = "dark",
  className,
}: LogoProps) {
  const cfg = SIZES[size];
  const isDark = variant === "dark";
  const bgColor = isDark ? "#FFFFFF" : "#070B16";
  const markColor = isDark ? "#070B16" : "#FFFFFF";

  return (
    <div
      className={cn("flex items-center select-none", className)}
      style={{ gap: cfg.gap }}
    >
      <span
        aria-hidden="true"
        className="inline-grid place-items-center shrink-0"
        style={{
          width: cfg.mark,
          height: cfg.mark,
          borderRadius: cfg.radius,
          background: bgColor,
          boxShadow: isDark
            ? "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(0,0,0,0.25), 0 8px 20px -6px rgba(0,0,0,0.35)"
            : "inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: "block" }}
        >
          <path
            d="M82.147 30.206 V46.11 H68.937 L58.906 30.206 Z"
            fill={markColor}
          />
          <path
            d="M14.735 30.206 V46.11 L33.442 47.034 L38.58 34.957 L35.544 30.206 Z"
            fill={markColor}
          />
          <path
            d="M67.089 74.223 L78.703 67.03 L55.804 30.206 H39.042 Z"
            fill={markColor}
          />
          <path
            d="M38.862 78.002 L26.569 69.604 L40.295 37.531 L49.666 51.786 Z"
            fill={markColor}
          />
        </svg>
      </span>

      {wordmark && (
        <span
          className="inline-flex flex-col items-start leading-none"
          style={{ color: "var(--text)" }}
        >
          <span
            className="inline-flex items-baseline"
            style={{
              fontSize: cfg.row1,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            <span style={{ fontWeight: 700 }}>Black</span>
            <span style={{ fontWeight: 400 }}>Belt</span>
          </span>
          <span
            style={{
              fontSize: cfg.swipe,
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              fontWeight: 500,
              marginTop: cfg.row1 * 0.18,
              opacity: 0.9,
            }}
          >
            Swipe
          </span>
        </span>
      )}
    </div>
  );
}
