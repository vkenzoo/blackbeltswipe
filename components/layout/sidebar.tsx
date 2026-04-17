"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Image as ImageIcon,
  FileText,
  Settings,
} from "lucide-react";
import { Logo } from "./logo";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { UserMenu } from "./user-menu";
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
  { label: "Ofertas", href: "/app/ofertas", icon: Package },
  { label: "Criativos", href: "/app/criativos", icon: ImageIcon },
  { label: "Páginas", href: "/app/paginas", icon: FileText },
];

const NAV_ADMIN: NavItem[] = [
  { label: "Ofertas", href: "/admin/offers", icon: Settings },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-3 mb-1 text-[10px] font-semibold text-text-3 uppercase tracking-[0.14em]">
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

export function Sidebar({ user }: { user: User }) {
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
        {user.role === "admin" && (
          <NavGroup label="Admin" items={NAV_ADMIN} />
        )}
      </nav>

      {/* User menu */}
      <UserMenu email={user.email} name={user.name} role={user.role} />
    </aside>
  );
}
