"use client";

import { ChevronsUpDown } from "lucide-react";

export function WorkspaceSwitcher() {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-md)]
                 glass-light
                 hover:bg-[var(--bg-elevated)]
                 transition-[background,border-color] duration-200 ease-[var(--ease-standard)]
                 text-left"
    >
      <div
        className="w-8 h-8 rounded-md grid place-items-center font-display font-semibold text-[13px]"
        style={{
          background:
            "linear-gradient(135deg, #2C2C2E 0%, #1C1C1E 100%)",
          color: "var(--text)",
          border: "1px solid var(--border-default)",
        }}
        aria-hidden="true"
      >
        R
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-text leading-tight truncate">
          ROI Ventures
        </div>
        <div className="text-[11px] text-text-3 leading-tight">Founder</div>
      </div>
      <ChevronsUpDown size={14} strokeWidth={1.5} className="text-text-3" />
    </button>
  );
}
