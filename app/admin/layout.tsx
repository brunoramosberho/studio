"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CalendarDays,
  Dumbbell,
  ClipboardList,
  Users,
  UserCog,
  Package,
  BarChart3,
  Palette,
  Building2,
  ShieldCheck,
  Megaphone,
  ShoppingBag,
  Trophy,
  ArrowLeft,
  Menu,
  X,
  MapPin,
  Loader2,
  Check,
  LogOut,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useBranding } from "@/components/branding-provider";
import { CreateClientDialog } from "@/components/admin/create-client-dialog";
import { MgicAIProvider, useMgicAI } from "@/components/admin/MgicAI";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/schedule", label: "Horario", icon: CalendarDays },
  { href: "/admin/classes", label: "Clases", icon: ClipboardList },
  { href: "/admin/class-types", label: "Disciplinas", icon: Dumbbell },
  { href: "/admin/clients", label: "Clientes", icon: Users },
  { href: "/admin/gamification", label: "Gamificación", icon: Trophy },
  { href: "/admin/coaches", label: "Coaches", icon: UserCog },
  { href: "/admin/packages", label: "Paquetes", icon: Package },
  { href: "/admin/shop", label: "Tienda", icon: ShoppingBag },
  { href: "/admin/feed", label: "Feed", icon: Megaphone },
  { href: "/admin/reports", label: "Reportes", icon: BarChart3 },
  { href: "/admin/studios", label: "Estudios", icon: Building2 },
  { href: "/admin/branding", label: "Marca", icon: Palette },
  { href: "/admin/team", label: "Equipo", icon: ShieldCheck },
];

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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const { studioName } = useBranding();

  const userName = session?.user?.name ?? "Admin";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

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
    <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
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

          <div className="flex items-center gap-1.5">
            {/* Quick actions -- hidden on mobile */}
            <span className="hidden text-xs text-muted/70 sm:inline">Add:</span>
            <button
              onClick={() => setShowCreateClient(true)}
              className="hidden items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface sm:flex"
            >
              <UserPlus className="h-3.5 w-3.5 text-admin" />
              Customer
            </button>

            <div className="mx-1 hidden h-5 w-px bg-border/50 sm:block" />

            <Link
              href="/admin/shop"
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground sm:flex"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              POS
            </Link>
            <Link
              href="/admin/schedule"
              className={cn(
                "hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:flex",
                pathname.startsWith("/admin/schedule")
                  ? "border border-admin/20 bg-admin/5 text-admin"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Schedule
            </Link>

            <div className="mx-1 hidden h-5 w-px bg-border/50 sm:block" />

            <Avatar className="h-8 w-8 ring-2 ring-admin/20">
              <AvatarImage src={session?.user?.image || undefined} />
              <AvatarFallback className="bg-admin/10 text-xs text-admin">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={async () => { await signOut({ redirect: false }); window.location.href = window.location.origin; }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-600"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-3.5rem-4px)]">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border/50 bg-white lg:block">
          <div className="sticky top-[calc(3.5rem+4px)] flex h-[calc(100dvh-3.5rem-4px)] flex-col">
            <nav className="flex-1 space-y-0.5 p-3">
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
            {locationPicker && (
              <div className="border-t border-border/50 p-3">
                {locationPicker}
              </div>
            )}
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
                  {locationPicker && (
                    <div className="mt-3 border-t border-border/50 pt-3">
                      {locationPicker}
                    </div>
                  )}
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
