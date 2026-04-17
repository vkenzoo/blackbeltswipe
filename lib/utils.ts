import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata data ISO pra "11 nov" (pt-BR curto)
 */
export function formatDateShort(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
  })
    .format(date)
    .replace(/\./g, "");
}

/**
 * Formata número com separador de milhar (2847 → "2,847")
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/**
 * Formata duração em segundos pra "32min" ou "1h 20min"
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

/**
 * 20 gradients pré-definidos pra thumbs de ofertas
 * Combinações escuras + saturadas pra parecer "poster de VSL"
 */
export const THUMB_GRADIENTS: Record<number, string> = {
  1:  "linear-gradient(135deg, #1a1a3e 0%, #2d1b4e 50%, #0f0c2a 100%)",
  2:  "linear-gradient(135deg, #2d1810 0%, #4e2d1b 50%, #1a0a04 100%)",
  3:  "linear-gradient(135deg, #0a2d1b 0%, #1b4e3a 50%, #041a0c 100%)",
  4:  "linear-gradient(135deg, #2a1a3e 0%, #4e1b3a 50%, #1a0a2a 100%)",
  5:  "linear-gradient(135deg, #1a2a3e 0%, #1b3a4e 50%, #0a1a2a 100%)",
  6:  "linear-gradient(135deg, #3e2a1a 0%, #4e3a1b 50%, #2a1a0a 100%)",
  7:  "linear-gradient(135deg, #3e1a1a 0%, #4e2d2d 50%, #1a0a0a 100%)",
  8:  "linear-gradient(135deg, #1a3e3e 0%, #1b4e4e 50%, #0a2a2a 100%)",
  9:  "linear-gradient(135deg, #3e1a3e 0%, #4e1b4e 50%, #2a0a2a 100%)",
  10: "linear-gradient(135deg, #1a3e1a 0%, #2d4e1b 50%, #0a2a0a 100%)",
  11: "linear-gradient(135deg, #3e3e1a 0%, #4e4e1b 50%, #2a2a0a 100%)",
  12: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #0a0a0a 100%)",
  13: "linear-gradient(135deg, #2d1b4e 0%, #1a1a3e 50%, #0f0c2a 100%)",
  14: "linear-gradient(135deg, #4e2d1b 0%, #2d1810 50%, #1a0a04 100%)",
  15: "linear-gradient(135deg, #1b4e3a 0%, #0a2d1b 50%, #041a0c 100%)",
  16: "linear-gradient(135deg, #4e1b3a 0%, #2a1a3e 50%, #1a0a2a 100%)",
  17: "linear-gradient(135deg, #1b3a4e 0%, #1a2a3e 50%, #0a1a2a 100%)",
  18: "linear-gradient(135deg, #4e3a1b 0%, #3e2a1a 50%, #2a1a0a 100%)",
  19: "linear-gradient(135deg, #4e2d2d 0%, #3e1a1a 50%, #1a0a0a 100%)",
  20: "linear-gradient(135deg, #1b4e4e 0%, #1a3e3e 50%, #0a2a2a 100%)",
};

export function thumbGradient(n: number): string {
  return THUMB_GRADIENTS[((n - 1) % 20) + 1];
}
