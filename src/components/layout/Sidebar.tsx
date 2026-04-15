"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Users,
  CreditCard,
  Settings,
  ChevronRight,
  Download,
  Plus,
  UserPlus,
  Zap,
  BarChart3,
  Mic2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  subAction?: { href: string; label: string; icon: React.ElementType };
};

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Tableau de bord",
    icon: LayoutDashboard,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-500/10",
  },
  {
    href: "/devis",
    label: "Devis",
    icon: FileText,
    iconColor: "text-indigo-400",
    iconBg: "bg-indigo-500/10",
  },
  {
    href: "/factures",
    label: "Factures",
    icon: Receipt,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
  },
  {
    href: "/clients",
    label: "Clients",
    icon: Users,
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
    subAction: {
      href: "/clients/nouveau",
      label: "Nouveau client",
      icon: UserPlus,
    },
  },
  {
    href: "/agents",
    label: "Agents",
    icon: Mic2,
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/10",
  },
  {
    href: "/budget",
    label: "Suivi budgétaire",
    icon: BarChart3,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
  },
  {
    href: "/paiements",
    label: "Paiements",
    icon: CreditCard,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10",
  },
  {
    href: "/export",
    label: "Export",
    icon: Download,
    iconColor: "text-teal-400",
    iconBg: "bg-teal-500/10",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 h-screen bg-slate-950 flex flex-col fixed left-0 top-0 z-40 border-r border-slate-800/50">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-800/50">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-shadow">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <span className="text-white font-bold text-[15px] tracking-tight leading-none block">
              ProdBill
            </span>
            <span className="text-slate-500 text-[10px] tracking-widest uppercase leading-none block mt-0.5">
              Production
            </span>
          </div>
        </Link>
      </div>

      {/* CTA Nouveau devis */}
      <div className="px-3 pt-4 pb-2">
        <Link
          href="/devis/nouveau"
          className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-900/30 hover:shadow-blue-900/50 transition-all"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Nouveau devis
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            const isClientsActive = pathname.startsWith("/clients");

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium group",
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  )}
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                      isActive ? item.iconBg : "bg-transparent"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4",
                        isActive ? item.iconColor : "text-slate-500"
                      )}
                    />
                  </div>
                  <span className="flex-1">{item.label}</span>
                  {isActive && (
                    <ChevronRight className="w-3.5 h-3.5 opacity-40 shrink-0" />
                  )}
                </Link>

                {/* Sub-action: Nouveau client visible quand on est sur /clients */}
                {item.subAction && isClientsActive && (
                  <Link
                    href={item.subAction.href}
                    className="flex items-center gap-2 ml-10 mt-0.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:text-violet-400 hover:bg-slate-800/40"
                  >
                    <item.subAction.icon className="w-3 h-3" />
                    {item.subAction.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-800/50 space-y-0.5">
        <Link
          href="/parametres"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium group",
            pathname.startsWith("/parametres")
              ? "bg-slate-800 text-white"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          )}
        >
          <div className="w-7 h-7 rounded-md flex items-center justify-center bg-slate-700/50 group-hover:bg-slate-700 transition-colors shrink-0">
            <Settings className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
          </div>
          <span>Paramètres</span>
        </Link>

        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/40 cursor-default">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-7 h-7",
              },
            }}
          />
          <span className="text-slate-400 text-sm truncate">Mon compte</span>
        </div>
      </div>
    </aside>
  );
}
