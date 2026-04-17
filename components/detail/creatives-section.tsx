import { Play } from "lucide-react";
import { thumbGradient } from "@/lib/utils";

type CreativesSectionProps = {
  baseGradient: number;
};

export function CreativesSection({ baseGradient }: CreativesSectionProps) {
  // 4 variations of the base gradient for visual variety
  const variants = [baseGradient, baseGradient + 5, baseGradient + 10, baseGradient + 15];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-semibold text-text-3 uppercase tracking-[0.14em] mb-1">
            Criativos
          </div>
          <h2 className="display text-[22px] font-semibold tracking-[-0.03em]">
            4 criativos ativos
          </h2>
        </div>
        <button
          type="button"
          className="text-[12px] text-text-2 hover:text-text transition-colors"
        >
          Ver todos →
        </button>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {variants.map((g, i) => (
          <div
            key={i}
            className="
              group relative aspect-[9/16] rounded-[var(--r-md)] overflow-hidden
              border border-[var(--border-hairline)]
              cursor-pointer
              transition-transform duration-200 ease-[var(--ease-spring)]
              hover:scale-[1.02]
            "
            style={{ background: thumbGradient(g) }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%)",
              }}
              aria-hidden="true"
            />
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full grid place-items-center border transition-transform duration-200 ease-[var(--ease-spring)] group-hover:scale-110"
              style={{
                background: "rgba(255,255,255,0.15)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                borderColor: "rgba(255,255,255,0.2)",
              }}
              aria-hidden="true"
            >
              <Play size={13} fill="white" strokeWidth={0} className="ml-0.5" />
            </div>
            <div className="absolute bottom-3 left-3 right-3 text-[11px] font-medium text-white/90 mono">
              Criativo {String(i + 1).padStart(2, "0")}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
