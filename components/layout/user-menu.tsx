"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { logUserEvent } from "@/lib/events/log-event";

type Props = {
  email: string;
  name: string | null;
  role: "admin" | "member" | "affiliate";
};

export function UserMenu({ email, name, role }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    // Loga sign_out ANTES do signOut (await pra garantir que o request complete
    // antes da sessão ser invalidada)
    await logUserEvent("sign_out", undefined, { await: true });
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = (name ?? email).charAt(0).toUpperCase();
  const displayName = name ?? email.split("@")[0];

  return (
    <div className="flex items-center gap-3 p-2 rounded-[var(--r-md)] border border-[var(--border-hairline)]">
      <div
        className={cn(
          "w-8 h-8 rounded-md grid place-items-center shrink-0",
          "bg-gradient-to-br from-white/90 to-white/40 text-black",
          "font-display font-bold text-[13px]"
        )}
        aria-hidden="true"
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-text leading-tight truncate">
          {displayName}
        </div>
        <div className="text-[10px] text-text-3 uppercase tracking-wider leading-tight">
          {role}
        </div>
      </div>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="
          p-2 rounded-[var(--r-sm)]
          text-text-3 hover:text-text hover:bg-[var(--bg-elevated)]
          transition-colors duration-200
          disabled:opacity-50
        "
        aria-label="Sair"
      >
        {busy ? (
          <Loader2 size={14} strokeWidth={1.8} className="animate-spin" />
        ) : (
          <LogOut size={14} strokeWidth={1.5} />
        )}
      </button>
    </div>
  );
}
