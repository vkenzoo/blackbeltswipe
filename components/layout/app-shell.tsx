"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Logo } from "./logo";

type User = {
  email: string;
  name: string | null;
  role: "admin" | "member" | "affiliate";
};

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Fecha o drawer quando user navega
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Previne scroll do body quando drawer aberto
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Fecha com Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen">
      {/* Mobile top bar — only visible < lg */}
      <header
        className="
          lg:hidden
          fixed top-0 left-0 right-0 z-40
          h-14 px-4
          flex items-center justify-between
          glass
          border-b border-[var(--border-hairline)]
        "
      >
        <Logo size="sm" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="
            p-2 -mr-2 rounded-[var(--r-sm)]
            text-text-2 hover:text-text hover:bg-[var(--bg-elevated)]
            transition-colors duration-200
          "
          aria-label="Abrir menu"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>
      </header>

      {/* Desktop sidebar — fixed at lg+ */}
      <div className="hidden lg:block">
        <Sidebar user={user} />
      </div>

      {/* Mobile drawer */}
      <div
        className={`
          lg:hidden
          fixed inset-0 z-50
          transition-opacity duration-300 ease-[var(--ease-standard)]
          ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-[4px]"
          onClick={() => setOpen(false)}
        />

        {/* Drawer */}
        <div
          className={`
            absolute left-0 top-0 bottom-0 w-[280px]
            transition-transform duration-300 ease-[var(--ease-standard)]
            ${open ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <Sidebar user={user} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="
              absolute top-3 right-3 z-10
              w-9 h-9 rounded-full
              grid place-items-center
              bg-[var(--bg-elevated)] text-text-2 hover:text-text
              border border-[var(--border-default)]
              transition-colors duration-200
            "
            aria-label="Fechar menu"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="lg:ml-[260px] min-h-screen pt-14 lg:pt-0">{children}</main>
    </div>
  );
}
