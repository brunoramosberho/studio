"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CalendarDays,
  Dumbbell,
  Users,
  UserCog,
  Package,
  ListOrdered,
  BarChart3,
  Palette,
  ArrowLeft,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useBranding } from "@/components/branding-provider";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/classes", label: "Clases", icon: Dumbbell },
  { href: "/admin/schedule", label: "Horario", icon: CalendarDays },
  { href: "/admin/coaches", label: "Coaches", icon: UserCog },
  { href: "/admin/clients", label: "Clientes", icon: Users },
  { href: "/admin/packages", label: "Paquetes", icon: Package },
  { href: "/admin/waitlist", label: "Lista de espera", icon: ListOrdered },
  { href: "/admin/reports", label: "Reportes", icon: BarChart3 },
  { href: "/admin/branding", label: "Marca", icon: Palette },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { studioName } = useBranding();

  const userName = session?.user?.name ?? "Admin";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <div className="min-h-dvh bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-admin/10 bg-white/80 backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-admin/80 to-admin/30" />
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-admin/5 lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold text-foreground">{studioName}</span>
              <span className="rounded-md bg-admin/10 px-2 py-0.5 text-xs font-semibold text-admin">
                Admin Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground sm:flex"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Sitio público
            </Link>
            <Avatar className="h-8 w-8 ring-2 ring-admin/20">
              <AvatarImage src={session?.user?.image || undefined} />
              <AvatarFallback className="bg-admin/10 text-xs text-admin">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-3.5rem-4px)]">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border/50 bg-white lg:block">
          <nav className="sticky top-[calc(3.5rem+4px)] flex flex-col gap-0.5 p-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-admin/10 text-admin"
                    : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                <item.icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Mobile sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-30 bg-foreground/20 backdrop-blur-sm lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: "spring", damping: 25, stiffness: 250 }}
                className="fixed left-0 top-0 z-40 h-dvh w-64 border-r border-border/50 bg-white pt-20 shadow-warm-lg lg:hidden"
              >
                <nav className="flex flex-col gap-0.5 p-3">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                        isActive(item.href)
                          ? "bg-admin/10 text-admin"
                          : "text-muted hover:bg-surface hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  ))}
                  <Link
                    href="/"
                    onClick={() => setSidebarOpen(false)}
                    className="mt-4 flex items-center gap-3 rounded-xl border border-border/50 px-3 py-3 text-sm text-muted transition-colors hover:bg-surface"
                  >
                    <ArrowLeft className="h-5 w-5" />
                    Sitio público
                  </Link>
                </nav>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
