"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Trophy,
  Image as ImageIcon,
  FileText,
  Settings,
  Activity,
  Users,
  BookOpen,
  Radio,
  History,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  Radar,
} from "lucide-react";
import { Logo } from "./logo";
import { UserMenu } from "./user-menu";
import { ApprovalBadge } from "./approval-badge";
import { AiSuggestBadge } from "./ai-suggest-badge";
import { cn } from "@/lib/utils";

type User = {
  email: string;
  name: string | null;
  role: "admin" | "member" | "affiliate";
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const NAV_GERAL: NavItem[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard },
  { label: "100 Ofertas", href: "/app/primeiras-100", icon: Trophy },
  { label: "Criativos", href: "/app/criativos", icon: ImageIcon },
  { label: "Páginas", href: "/app/paginas", icon: FileText },
];

const NAV_ADMIN: NavItem[] = [
  { label: "Ofertas", href: "/admin/offers", icon: Settings },
  { label: "AI Suggest", href: "/admin/ai-suggest", icon: Sparkles },
  { label: "Aprovações", href: "/admin/aprovacoes", icon: ShieldCheck },
  { label: "Workers", href: "/admin/workers", icon: Activity },
  { label: "Contagem de Ads", href: "/admin/contagem-ads", icon: Radar },
  { label: "Meta API", href: "/admin/meta-api", icon: Radio },
  { label: "Logs", href: "/admin/logs", icon: History },
  { label: "Erros", href: "/admin/erros", icon: AlertTriangle },
  { label: "Membros", href: "/admin/membros", icon: Users },
  { label: "Guias", href: "/admin/guias", icon: BookOpen },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-[2px]">
      <div className="eyebrow px-3 mb-1.5">
        {label}
      </div>
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group relative flex items-center gap-2.5 pl-3 pr-3 h-9 rounded-[10px]",
              "text-[13.5px] font-medium leading-none",
              "transition-[background,color,box-shadow,transform] duration-[var(--dur-2)] ease-[var(--ease-apple)]",
              "active:scale-[0.985]",
              active
                ? "text-text bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                : "text-text-2 hover:text-text hover:bg-[var(--bg-glass)]"
            )}
          >
            {/* Active indicator — iOS-style left rail */}
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-[-6px] top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full"
                style={{
                  background: "var(--accent)",
                  boxShadow: "0 0 8px var(--accent-glow)",
                }}
              />
            )}
            <Icon
              size={15}
              strokeWidth={active ? 2 : 1.6}
              className={cn(
                "shrink-0 transition-transform duration-[var(--dur-1)] ease-[var(--ease-apple)]",
                "group-hover:scale-110",
                active ? "text-text" : "text-text-3 group-hover:text-text-2"
              )}
            />
            <span className="truncate">{item.label}</span>
            {item.href === "/admin/aprovacoes" && <ApprovalBadge />}
            {item.href === "/admin/ai-suggest" && <AiSuggestBadge />}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar({ user }: { user: User }) {
  return (
    <aside
      className="fixed left-0 top-0 bottom-0 w-[248px] z-30
                 flex flex-col
                 px-3 pt-5 pb-4 gap-5
                 border-r border-[var(--border-hairline)]
                 bg-[color-mix(in_srgb,var(--bg-surface)_94%,transparent)]
                 backdrop-blur-[28px] backdrop-saturate-[185%]"
      aria-label="Navegação principal"
      style={{
        boxShadow:
          "inset -1px 0 0 rgba(255,255,255,0.025), 1px 0 24px -8px rgba(0,0,0,0.4)",
      }}
    >
      {/* Logo */}
      <div className="px-2 py-1">
        <Logo size="md" />
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto flex flex-col gap-5 -mx-1 px-1">
        <NavGroup label="Geral" items={NAV_GERAL} />
        {user.role === "admin" && (
          <>
            {/* Hairline divider between groups */}
            <div
              aria-hidden="true"
              className="mx-3 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, var(--border-hairline) 20%, var(--border-hairline) 80%, transparent 100%)",
              }}
            />
            <NavGroup label="Admin" items={NAV_ADMIN} />
          </>
        )}
      </nav>

      {/* User menu */}
      <UserMenu email={user.email} name={user.name} role={user.role} />
    </aside>
  );
}
