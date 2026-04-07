"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarOff,
  Dumbbell,
  ClipboardList,
  ClipboardCheck,
  Users,
  UserCog,
  Package,
  BarChart3,
  Activity,
  Palette,
  Building2,
  ShieldCheck,
  Megaphone,
  ShoppingBag,
  Trophy,
  Sparkles,
  ArrowLeft,
  Menu,
  X,
  MapPin,
  Loader2,
  Check,
  LogOut,
  UserPlus,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useBranding } from "@/components/branding-provider";
import { CreateClientDialog } from "@/components/admin/create-client-dialog";
import { MgicAIProvider, useMgicAI } from "@/components/admin/MgicAI";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "pendingWaitlist" | "newClients" | "recentFeed";
  contextKey?: "activeClasses";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Operaciones",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/schedule", label: "Horario", icon: CalendarDays, badgeKey: "pendingWaitlist" },
      { href: "/admin/classes", label: "Clases", icon: ClipboardList, contextKey: "activeClasses" },
      { href: "/admin/check-in", label: "Check-in", icon: ClipboardCheck },
      { href: "/admin/coaches", label: "Coaches", icon: UserCog },
      { href: "/admin/availability", label: "Disponibilidad", icon: CalendarOff },
      { href: "/admin/class-types", label: "Disciplinas", icon: Dumbbell },
    ],
  },
  {
    title: "Comunidad",
    items: [
      { href: "/admin/clients", label: "Clientes", icon: Users, badgeKey: "newClients" },
      { href: "/admin/feed", label: "Feed", icon: Megaphone, badgeKey: "recentFeed" },
      { href: "/admin/gamification", label: "Logros", icon: Trophy },
    ],
  },
  {
    title: "Negocio",
    items: [
      { href: "/admin/packages", label: "Paquetes", icon: Package },
      { href: "/admin/shop", label: "Tienda", icon: ShoppingBag },
      { href: "/admin/reports", label: "Reportes", icon: BarChart3 },
      { href: "/admin/analytics", label: "Rendimiento", icon: Activity },
    ],
  },
  {
    title: "Configuración",
    items: [
      { href: "/admin/branding", label: "Marca", icon: Palette },
      { href: "/admin/team", label: "Equipo", icon: ShieldCheck },
      { href: "/admin/studios", label: "Estudios", icon: Building2 },
    ],
  },
];

interface SidebarStats {
  activeClasses: number;
  pendingWaitlist: number;
  newClients: number;
  recentFeed: number;
}

function useSidebarStats() {
  const [stats, setStats] = useState<SidebarStats | null>(null);
  const load = useCallback(() => {
    fetch("/api/admin/sidebar-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);
  return stats;
}

interface LocCountry {
  id: string;
  name: string;
  code: string;
  cities: { id: string; name: string }[];
}

function countryFlag(code: string) {
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

function AdminMain({ children }: { children: React.ReactNode }) {
  const { isOpen, mode, panelWidth } = useMgicAI();
  const isSidebarPush = isOpen && mode === "sidebar";

  return (
    <main
      className="flex-1 px-4 py-6 transition-[margin] duration-300 ease-in-out sm:px-6 lg:px-8"
      style={{
        marginRight: isSidebarPush ? `${panelWidth}px` : undefined,
      }}
    >
      {children}
    </main>
  );
}

function Badge({ count, variant = "red" }: { count: number; variant?: "red" | "green" }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums",
        variant === "red" && "bg-red-500/10 text-red-600",
        variant === "green" && "bg-emerald-500/10 text-emerald-600",
      )}
    >
      {variant === "green" && "+"}
      {count}
    </span>
  );
}

function ContextTag({ label }: { label: string }) {
  return (
    <span className="ml-auto rounded-sm border border-border/60 px-1.5 py-px text-[10px] font-medium text-muted">
      {label}
    </span>
  );
}

function MgicAIButton() {
  const { toggle, isOpen } = useMgicAI();
  const { colorAdmin } = useBranding();

  return (
    <button
      onClick={toggle}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[13px] font-semibold transition-all",
        isOpen
          ? "bg-admin/10 text-admin ring-1 ring-admin/20"
          : "text-white hover:brightness-110",
      )}
      style={isOpen ? undefined : { backgroundColor: colorAdmin }}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-sm",
          isOpen ? "bg-admin/10" : "bg-white/15",
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <span className="flex-1">Mgic AI</span>
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
          isOpen ? "bg-admin/10 text-admin" : "bg-white/20 text-white/90",
        )}
      >
        nuevo
      </span>
    </button>
  );
}

interface SidebarNavProps {
  sections: NavSection[];
  stats: SidebarStats | null;
  pathname: string;
  onNavigate?: () => void;
  mobile?: boolean;
}

function SidebarNav({ sections, stats, pathname, onNavigate, mobile }: SidebarNavProps) {
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const py = mobile ? "py-2" : "py-1.5";

  return (
    <>
      {sections.map((section, sIdx) => (
        <div key={section.title} className={sIdx > 0 ? "mt-5" : ""}>
          <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted/60">
            {section.title}
          </p>
          <div className="space-y-px">
            {section.items.map((item) => {
              const active = isActive(item.href);
              const badgeVal = item.badgeKey && stats ? stats[item.badgeKey] : 0;
              const contextVal =
                item.contextKey === "activeClasses" && stats?.activeClasses
                  ? `${stats.activeClasses} activas`
                  : null;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-sm px-2.5 text-[13px] font-medium transition-colors",
                    py,
                    active
                      ? "bg-admin/8 font-semibold text-admin"
                      : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-admin" : "text-foreground/40 group-hover:text-foreground/60",
                    )}
                    strokeWidth={active ? 2.25 : 1.75}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badgeVal ? (
                    <Badge
                      count={badgeVal}
                      variant={item.badgeKey === "newClients" ? "green" : "red"}
                    />
                  ) : contextVal ? (
                    <ContextTag label={contextVal} />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const { studioName } = useBranding();
  const stats = useSidebarStats();

  const userName = session?.user?.name ?? "Admin";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const [locations, setLocations] = useState<LocCountry[]>([]);
  const [locValue, setLocValue] = useState("");
  const [locSaving, setLocSaving] = useState(false);
  const [locSaved, setLocSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [locRes, profRes, studiosRes] = await Promise.all([
          fetch("/api/locations"),
          fetch("/api/profile"),
          fetch("/api/studios"),
        ]);
        if (cancelled) return;

        const allLocations: LocCountry[] = locRes.ok ? await locRes.json() : [];
        const studios: { cityId: string }[] = studiosRes.ok ? await studiosRes.json() : [];
        const studioCityIds = new Set(studios.map((s) => s.cityId));

        const filtered = allLocations
          .map((c) => ({ ...c, cities: c.cities.filter((city) => studioCityIds.has(city.id)) }))
          .filter((c) => c.cities.length > 0);
        setLocations(filtered);

        if (profRes.ok) {
          const p = await profRes.json();
          if (p.countryId && p.cityId) {
            setLocValue(`${p.countryId}|${p.cityId}`);
          } else if (filtered.length === 1 && filtered[0].cities.length === 1) {
            const only = filtered[0];
            const val = `${only.id}|${only.cities[0].id}`;
            setLocValue(val);
            fetch("/api/profile", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ countryId: only.id, cityId: only.cities[0].id }),
            }).catch(() => {});
          }
        }
      } catch {}
    }
    if (session?.user) load();
    return () => { cancelled = true; };
  }, [session?.user]);

  async function handleLocChange(val: string) {
    setLocValue(val);
    const [countryId, cityId] = val.split("|");
    setLocSaving(true);
    setLocSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId: countryId || null, cityId: cityId || null }),
      });
      if (res.ok) {
        setLocSaved(true);
        setTimeout(() => setLocSaved(false), 2000);
      }
    } catch {}
    setLocSaving(false);
  }

  const totalCities = locations.reduce((sum, c) => sum + c.cities.length, 0);

  const locationPicker = totalCities > 1 ? (
    <div className="flex items-center gap-2 rounded-sm bg-surface px-3 py-2">
      <MapPin className="h-3.5 w-3.5 shrink-0 text-admin/60" />
      <select
        value={locValue}
        onChange={(e) => handleLocChange(e.target.value)}
        className="min-w-0 flex-1 appearance-none bg-transparent text-xs font-medium text-foreground outline-none"
      >
        <option value="">Seleccionar ubicación</option>
        {locations.map((c) =>
          c.cities.map((city) => (
            <option key={city.id} value={`${c.id}|${city.id}`}>
              {countryFlag(c.code)} {city.name}
            </option>
          )),
        )}
      </select>
      {locSaving && <Loader2 className="h-3 w-3 animate-spin text-muted" />}
      {locSaved && <Check className="h-3 w-3 text-green-500" />}
    </div>
  ) : null;

  return (
    <MgicAIProvider>
    <div className="min-h-dvh bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-admin/10 bg-white/80 backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-admin/80 to-admin/30" />
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-sm text-foreground transition-colors hover:bg-admin/5 lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold text-foreground">{studioName}</span>
              <span className="rounded-sm bg-admin/10 px-2 py-0.5 text-xs font-semibold text-admin">
                Admin Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick actions -- hidden on mobile */}
            <span className="hidden text-xs text-muted/70 sm:inline">Add:</span>
            <button
              onClick={() => setShowCreateClient(true)}
              className="hidden items-center gap-1.5 rounded-sm border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface sm:flex"
            >
              <UserPlus className="h-3.5 w-3.5 text-admin" />
              Customer
            </button>

            <div className="mx-1 hidden h-5 w-px bg-border/50 sm:block" />

            <Link
              href="/admin/shop"
              className="hidden items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground sm:flex"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              POS
            </Link>
            <Link
              href="/admin/schedule"
              className={cn(
                "hidden items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors sm:flex",
                pathname.startsWith("/admin/schedule")
                  ? "border border-admin/20 bg-admin/5 text-admin"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Schedule
            </Link>

            <div className="mx-1 hidden h-5 w-px bg-border/50 sm:block" />

            <Link href="/admin/profile" title="Mi perfil">
              <Avatar className="h-8 w-8 ring-2 ring-admin/20 transition-shadow hover:ring-admin/40">
                <AvatarImage src={session?.user?.image || undefined} />
                <AvatarFallback className="bg-admin/10 text-xs text-admin">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Link>
            <button
              onClick={async () => { await signOut({ redirect: false }); window.location.href = window.location.origin; }}
              className="flex h-8 w-8 items-center justify-center rounded-sm text-muted transition-colors hover:bg-red-50 hover:text-red-600"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-3.5rem-4px)]">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 border-r border-border/40 bg-white lg:block">
          <div className="sticky top-[calc(3.5rem+4px)] flex h-[calc(100dvh-3.5rem-4px)] flex-col">
            {/* Mgic AI protagonist */}
            <div className="p-3 pb-0">
              <MgicAIButton />
            </div>

            {/* Scrollable nav sections */}
            <nav className="flex-1 overflow-y-auto p-3 pt-4">
              <SidebarNav sections={navSections} stats={stats} pathname={pathname} />
            </nav>

            {/* Bottom: profile + location */}
            <div className="border-t border-border/40 p-3 space-y-1">
              <Link
                href="/admin/profile"
                className={cn(
                  "flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  pathname === "/admin/profile"
                    ? "bg-admin/8 font-semibold text-admin"
                    : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                <UserCircle
                  className={cn("h-4 w-4", pathname === "/admin/profile" ? "text-admin" : "text-foreground/40")}
                  strokeWidth={pathname === "/admin/profile" ? 2.25 : 1.75}
                />
                Mi perfil
              </Link>
              {locationPicker}
            </div>
          </div>
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
                className="fixed left-0 top-0 z-40 flex h-dvh w-64 flex-col border-r border-border/40 bg-white pt-16 shadow-warm-lg lg:hidden"
              >
                {/* Mgic AI protagonist (mobile) */}
                <div className="px-3 pt-4 pb-1">
                  <MgicAIButton />
                </div>

                <nav className="flex-1 overflow-y-auto p-3">
                  <SidebarNav
                    sections={navSections}
                    stats={stats}
                    pathname={pathname}
                    onNavigate={() => setSidebarOpen(false)}
                    mobile
                  />
                </nav>

                <div className="border-t border-border/40 p-3 space-y-1">
                  <Link
                    href="/admin/profile"
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] font-medium transition-colors",
                      pathname === "/admin/profile"
                        ? "bg-admin/8 font-semibold text-admin"
                        : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
                    )}
                  >
                    <UserCircle
                      className={cn("h-4 w-4", pathname === "/admin/profile" ? "text-admin" : "text-foreground/40")}
                      strokeWidth={pathname === "/admin/profile" ? 2.25 : 1.75}
                    />
                    Mi perfil
                  </Link>
                  {locationPicker}
                  <Link
                    href="/"
                    onClick={() => setSidebarOpen(false)}
                    className="mt-2 flex items-center gap-2.5 rounded-sm border border-border/50 px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-foreground/[0.03]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Sitio público
                  </Link>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main content */}
        <AdminMain>{children}</AdminMain>
      </div>

      <CreateClientDialog
        open={showCreateClient}
        onOpenChange={setShowCreateClient}
      />
    </div>
    </MgicAIProvider>
  );
}
