"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Image as ImageIcon,
  FileText,
  Share2,
  Zap,
  BarChart3,
  MessagesSquare,
  Sparkles,
  Heart,
  GraduationCap,
  Power,
  Globe,
} from "lucide-react";
import { Logo } from "./logo";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const NAV_GERAL: NavItem[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard },
  { label: "Ofertas", href: "/app/ofertas", icon: Package },
  { label: "Criativos", href: "/app/criativos", icon: ImageIcon },
  { label: "Páginas", href: "/app/paginas", icon: FileText },
  { label: "Hub de afiliação", href: "/app/hub", icon: Share2 },
  { label: "On Demand", href: "/app/ondemand", icon: Zap },
  { label: "Relatórios", href: "/app/relatorios", icon: BarChart3 },
  { label: "Discord", href: "/app/discord", icon: MessagesSquare },
];

const NAV_PRA_VOCE: NavItem[] = [
  { label: "Recomendados", href: "/app/recomendados", icon: Sparkles },
  { label: "Favoritos", href: "/app/favoritos", icon: Heart },
  { label: "Academy", href: "/app/academy", icon: GraduationCap },
  { label: "Ads Power", href: "/app/ads-power", icon: Power },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-3 mb-1 text-[10px] font-semibold text-text-3 uppercase tracking-[0.14em]">
        {label}
      </div>
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-center gap-3 px-3 py-2 rounded-[var(--r-md)]",
              "text-[13px] font-medium",
              "transition-[background,color,border-color] duration-200 ease-[var(--ease-standard)]",
              active
                ? "bg-[var(--bg-elevated)] text-text border border-[var(--border-default)]"
                : "text-text-2 hover:text-text hover:bg-[var(--bg-glass)] border border-transparent"
            )}
          >
            <Icon size={15} strokeWidth={1.5} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside
      className="fixed left-0 top-0 bottom-0 w-[260px] z-30
                 glass
                 flex flex-col
                 p-4 gap-5"
      aria-label="Navegação principal"
    >
      {/* Logo */}
      <div className="px-1 py-1">
        <Logo size="md" />
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher />

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto flex flex-col gap-5 -mx-1 px-1">
        <NavGroup label="Geral" items={NAV_GERAL} />
        <NavGroup label="Pra você" items={NAV_PRA_VOCE} />
      </nav>

      {/* Suporte / idioma */}
      <div className="pt-3 border-t border-[var(--border-hairline)]">
        <div className="px-3 mb-1 text-[10px] font-semibold text-text-3 uppercase tracking-[0.14em]">
          Suporte
        </div>
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--r-md)]
                     text-[13px] font-medium text-text-2 hover:text-text
                     hover:bg-[var(--bg-glass)]
                     transition-[background,color] duration-200 ease-[var(--ease-standard)]"
        >
          <Globe size={15} strokeWidth={1.5} />
          <span>🇧🇷 Português</span>
        </button>
      </div>
    </aside>
  );
}
