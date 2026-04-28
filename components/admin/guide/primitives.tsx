import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Primitivas reutilizáveis dos guias admin
// ─────────────────────────────────────────────────────────────

export function GuideSection({
  icon,
  iconColor,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-[var(--r-sm)] grid place-items-center shrink-0 mt-0.5"
          style={{
            background: `color-mix(in srgb, ${iconColor} 14%, transparent)`,
            color: iconColor,
          }}
        >
          {icon}
        </div>
        <div className="flex flex-col gap-0.5">
          <h2 className="display text-[18px] font-semibold tracking-[-0.02em]">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[12.5px] text-text-2 leading-relaxed max-w-[620px]">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="pl-12">{children}</div>
    </section>
  );
}

export function GuideTldr({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section
      className="glass rounded-[var(--r-lg)] p-5 flex flex-col gap-3"
      style={{
        borderLeft: "3px solid var(--accent)",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, transparent) 0%, transparent 100%)",
      }}
    >
      <h2 className="display text-[14px] font-semibold tracking-[-0.01em]">
        TL;DR — o essencial
      </h2>
      <ul className="flex flex-col gap-2 text-[12.5px] text-text-2 leading-relaxed list-disc pl-5">
        {children}
      </ul>
    </section>
  );
}

export function GuideSteps({
  items,
}: {
  items: Array<{ num: number; title: string; body: React.ReactNode }>;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.num} className="flex items-start gap-3">
          <span
            className="w-7 h-7 rounded-full grid place-items-center text-[12px] font-semibold shrink-0"
            style={{
              background: "color-mix(in srgb, var(--accent) 14%, transparent)",
              color: "var(--accent)",
            }}
          >
            {item.num}
          </span>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <h4 className="text-[13px] font-semibold text-text">
              {item.title}
            </h4>
            <p className="text-[12.5px] text-text-2 leading-relaxed">
              {item.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function GuidePanel({
  title,
  link,
  items,
}: {
  title: string;
  link?: string;
  items: React.ReactNode[];
}) {
  return (
    <div className="glass rounded-[var(--r-md)] p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="display text-[13.5px] font-semibold tracking-[-0.01em]">
          {title}
        </h3>
        {link && (
          <Link
            href={link}
            className="text-[11px] text-[var(--accent)] hover:underline inline-flex items-center gap-1"
          >
            Abrir
            <ExternalLink size={9} strokeWidth={2} />
          </Link>
        )}
      </div>
      <ul className="flex flex-col gap-1.5 text-[12px] text-text-2 leading-snug">
        {items.map((text, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <CheckCircle2
              size={10}
              strokeWidth={2}
              className="mt-1 shrink-0 text-text-3"
            />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GuideCallout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "error" | "success";
  title: string;
  children: React.ReactNode;
}) {
  const color =
    tone === "warning"
      ? "#F59E0B"
      : tone === "error"
        ? "var(--error)"
        : tone === "success"
          ? "var(--success)"
          : "var(--accent)";

  return (
    <div
      className="rounded-[var(--r-md)] px-4 py-3 flex items-start gap-3"
      style={{
        background: `color-mix(in srgb, ${color} 6%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
      }}
    >
      <AlertTriangle
        size={14}
        strokeWidth={2}
        className="mt-0.5 shrink-0"
        style={{ color }}
      />
      <div className="flex flex-col gap-1 text-[12.5px] text-text leading-relaxed">
        <div
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {title}
        </div>
        <div className="text-text-2">{children}</div>
      </div>
    </div>
  );
}

export function GuideKbd({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="mono text-[11px] px-1.5 py-0.5 rounded"
      style={{ background: "var(--bg-elevated)" }}
    >
      {children}
    </code>
  );
}

export function GuideProblemCard({
  problem,
  signs,
  cause,
  solution,
  severity = "warning",
}: {
  problem: string;
  signs: string | React.ReactNode;
  cause: string | React.ReactNode;
  solution: React.ReactNode;
  severity?: "low" | "warning" | "high" | "critical";
}) {
  const colors = {
    low: "#06B6D4",
    warning: "#F59E0B",
    high: "#F59E0B",
    critical: "var(--error)",
  };
  const color = colors[severity];

  return (
    <div
      className="glass rounded-[var(--r-md)] p-4 flex flex-col gap-2.5"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          strokeWidth={2}
          className="mt-0.5 shrink-0"
          style={{ color }}
        />
        <h4 className="text-[14px] font-semibold text-text leading-tight">
          {problem}
        </h4>
      </div>
      <div className="flex flex-col gap-2 text-[12.5px] pl-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10.5px] uppercase tracking-wider text-text-3 font-semibold">
            Sinais
          </span>
          <span className="text-text-2 leading-relaxed">{signs}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10.5px] uppercase tracking-wider text-text-3 font-semibold">
            Causa provável
          </span>
          <span className="text-text-2 leading-relaxed">{cause}</span>
        </div>
        <div
          className="rounded-[var(--r-sm)] px-3 py-2 mt-1"
          style={{
            background: `color-mix(in srgb, ${color} 5%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 18%, transparent)`,
          }}
        >
          <span
            className="text-[10.5px] font-semibold uppercase tracking-wider"
            style={{ color }}
          >
            O que fazer →{" "}
          </span>
          <span className="text-text leading-relaxed">{solution}</span>
        </div>
      </div>
    </div>
  );
}
