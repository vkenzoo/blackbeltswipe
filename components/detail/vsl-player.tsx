"use client";

import { Play } from "lucide-react";
import { thumbGradient } from "@/lib/utils";

type VslPlayerProps = {
  thumbGradientNumber: number;
};

export function VslPlayer({ thumbGradientNumber }: VslPlayerProps) {
  return (
    <div className="relative rounded-[var(--r-xl)] overflow-hidden aspect-[16/10] border border-[var(--border-hairline)]">
      {/* Radial glow background */}
      <div
        className="absolute -inset-[40%] pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(circle at center, var(--accent-glow) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />

      {/* Inner frame with gradient thumbnail */}
      <div
        className="absolute inset-0 grid place-items-center z-10"
        style={{ background: thumbGradient(thumbGradientNumber) }}
      >
        <div
          className="w-[72px] h-[72px] rounded-full grid place-items-center border cursor-pointer transition-transform duration-200 ease-[var(--ease-spring)] hover:scale-110"
          style={{
            background: "rgba(255,255,255,0.2)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderColor: "rgba(255,255,255,0.25)",
          }}
          role="button"
          tabIndex={0}
          aria-label="Reproduzir vídeo"
        >
          <Play size={24} fill="white" strokeWidth={0} className="ml-1" />
        </div>
      </div>
    </div>
  );
}
