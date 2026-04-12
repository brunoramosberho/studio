"use client";

import Link from "next/link";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarOff,
  UserCircle,
  BarChart3,
  User,
  ArrowLeft,
  ArrowRightLeft,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useBranding } from "@/components/branding-provider";

const navItems = [
  { href: "/coach", labelKey: "dashboard" as const, icon: LayoutDashboard },
  { href: "/coach/schedule", labelKey: "mySchedule" as const, icon: CalendarDays },
  { href: "/coach/availability", labelKey: "availability" as const, icon: CalendarOff },
  { href: "/coach/fans", labelKey: "myFans" as const, icon: UserCircle },
  { href: "/coach/stats", labelKey: "myHistory" as const, icon: BarChart3 },
  { href: "/coach/profile", labelKey: "myProfile" as const, icon: User },
];

function CoachLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { studioName } = useBranding();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useTranslations("coach");
  const tc = useTranslations("common");

  const userName = session?.user?.name ?? "Coach";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="min-h-dvh bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-coach/10 bg-white/80 backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-coach/80 to-coach/30" />
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-coach/5 lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold text-foreground">{studioName}</span>
              <span className="rounded-md bg-coach/10 px-2 py-0.5 text-xs font-semibold text-coach">
                {t("portal")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/my"
              className="hidden items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground sm:flex"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {t("clientView")}
            </Link>
            <Avatar className="h-8 w-8 ring-2 ring-coach/20">
              <AvatarImage src={session?.user?.image || undefined} />
              <AvatarFallback className="bg-coach/10 text-xs text-coach">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={async () => { await signOut({ redirect: false }); window.location.href = window.location.origin; }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-600"
              title={tc("logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-3.5rem-4px)]">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border/50 bg-white lg:block">
          <nav className="sticky top-[calc(3.5rem+4px)] flex flex-col gap-1 p-4">
            {navItems.map((item) => {
              const active =
                item.href === "/coach"
                  ? pathname === "/coach"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-coach/10 text-coach"
                      : "text-muted hover:bg-surface hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4.5 w-4.5" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
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
                <nav className="flex flex-col gap-1 p-4">
                  {navItems.map((item) => {
                    const active =
                      item.href === "/coach"
                        ? pathname === "/coach"
                        : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                          active
                            ? "bg-coach/10 text-coach"
                            : "text-muted hover:bg-surface hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        {t(item.labelKey)}
                      </Link>
                    );
                  })}
                  <Link
                    href="/my"
                    onClick={() => setSidebarOpen(false)}
                    className="mt-4 flex items-center gap-3 rounded-xl border border-border/50 px-3 py-3 text-sm text-muted transition-colors hover:bg-surface"
                  >
                    <ArrowRightLeft className="h-5 w-5" />
                    {t("clientView")}
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

export function CoachLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth-admin">
      <CoachLayoutInner>{children}</CoachLayoutInner>
    </SessionProvider>
  );
}
