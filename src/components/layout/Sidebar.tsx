"use client";

import { useEffect, useState } from "react";
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
  Download,
  Plus,
  UserPlus,
  BarChart3,
  Mic2,
  Smile,
  Shield,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";

interface SidebarProps {
  isAdmin?: boolean;
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  subAction?: { href: string; label: string; icon: React.ElementType };
};

const navItems: NavItem[] = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/devis", label: "Devis", icon: FileText },
  { href: "/factures", label: "Factures", icon: Receipt },
  {
    href: "/clients",
    label: "Clients",
    icon: Users,
    subAction: { href: "/clients/nouveau", label: "Nouveau client", icon: UserPlus },
  },
  { href: "/comediens", label: "Comédiens", icon: Smile },
  { href: "/agents", label: "Agents", icon: Mic2 },
  { href: "/budget", label: "Suivi budgétaire", icon: BarChart3 },
  { href: "/paiements", label: "Paiements", icon: CreditCard },
  { href: "/export", label: "Export", icon: Download },
];

// DA ProdBill (C-REDESIGN-PHASE2-APP, étape 2) : fond crème, onglet actif
// dans une capsule presque noire, icônes Lucide fines monochromes.
const itemBase =
  "flex items-center gap-3 px-3.5 py-2 rounded-full text-[14px] font-medium";
const itemActive = "bg-brand-ink text-brand-cream";
const itemIdle = "text-brand-ink hover:bg-brand-surface";

export function Sidebar({ isAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  // Tiroir de navigation sous lg (téléphone / iPad portrait).
  const [open, setOpen] = useState(false);

  // Fermeture à chaque navigation et sur Échap.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isClientsActive = pathname.startsWith("/clients");

  return (
    <>
      {/* ── Header mobile / tablette ───────────────────────────── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-brand-cream/95 border-b border-brand-rule flex items-center justify-between px-4">
        <Link href="/" aria-label="ProdBill — tableau de bord">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="app-nav"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          {open ? <X className="w-4 h-4" strokeWidth={1.75} /> : <Menu className="w-4 h-4" strokeWidth={1.75} />}
          <span>{open ? "Fermer" : "Menu"}</span>
        </button>
      </header>

      {/* Voile derrière le tiroir (mobile) */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-brand-ink/25"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Navigation ─────────────────────────────────────────── */}
      <aside
        id="app-nav"
        aria-label="Navigation principale"
        className={cn(
          "w-64 lg:w-60 h-dvh bg-brand-cream border-r border-brand-rule flex flex-col fixed left-0 top-0 z-50",
          "transition-[transform,visibility] duration-200 lg:translate-x-0 lg:visible",
          // Fermé sous lg : hors écran ET invisible (sorti de l'ordre de tabulation).
          open ? "translate-x-0 visible" : "-translate-x-full invisible"
        )}
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <Link href="/" className="inline-block" aria-label="ProdBill — tableau de bord">
            <Logo />
          </Link>
          <span className="block mt-1.5 text-[10px] font-medium tracking-[0.2em] uppercase text-brand-ink-muted">
            Production &amp; facturation
          </span>
        </div>

        {/* CTA Nouveau devis */}
        <div className="px-4 pb-4">
          <Link
            href="/devis/nouveau"
            className="flex items-center justify-center gap-2 w-full h-9 rounded-[var(--radius-control)] text-[13px] font-semibold text-brand-cream bg-brand-blue hover:bg-brand-ink"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Nouveau devis
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 overflow-y-auto">
          <p className="px-3.5 pb-2 text-[10px] font-medium tracking-[0.2em] uppercase text-brand-ink-muted">
            Atelier
          </p>
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(itemBase, isActive ? itemActive : itemIdle)}
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                    <span className="flex-1">{item.label}</span>
                  </Link>

                  {/* Sub-action : Nouveau client visible quand on est sur /clients */}
                  {item.subAction && isClientsActive && (
                    <Link
                      href={item.subAction.href}
                      className="flex items-center gap-2 ml-7 mt-0.5 px-3 py-1.5 rounded-full text-xs font-medium text-brand-ink-muted hover:text-brand-ink hover:bg-brand-surface"
                    >
                      <item.subAction.icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {item.subAction.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-brand-rule space-y-0.5">
          {isAdmin && (
            <Link
              href="/admin/workspaces"
              aria-current={pathname.startsWith("/admin") ? "page" : undefined}
              className={cn(itemBase, pathname.startsWith("/admin") ? itemActive : itemIdle)}
            >
              <Shield className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span className="flex-1">Admin</span>
              {/* Pastille rouge orangé : zone sensible (impersonation…) */}
              <span className="w-2 h-2 rounded-full bg-brand-coral" aria-hidden />
            </Link>
          )}
          <Link
            href="/parametres"
            aria-current={pathname.startsWith("/parametres") ? "page" : undefined}
            className={cn(itemBase, pathname.startsWith("/parametres") ? itemActive : itemIdle)}
          >
            <Settings className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            <span>Paramètres</span>
          </Link>

          <div className="flex items-center gap-3 px-3.5 py-2">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-7 h-7",
                },
              }}
            />
            <span className="text-brand-ink-muted text-sm truncate">Mon compte</span>
          </div>
        </div>
      </aside>
    </>
  );
}
