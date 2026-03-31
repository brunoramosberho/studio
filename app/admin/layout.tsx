"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useBranding } from "@/components/branding-provider";
import { toast } from "sonner";

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

  const [locations, setLocations] = useState<LocCountry[]>([]);
  const [locValue, setLocValue] = useState("");
  const [locSaving, setLocSaving] = useState(false);
  const [locSaved, setLocSaved] = useState(false);
  const LOC_NONE = "__none__";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [locRes, profRes] = await Promise.all([
          fetch("/api/locations"),
          fetch("/api/profile"),
        ]);
        if (cancelled) return;
        if (locRes.ok) setLocations(await locRes.json());
        if (profRes.ok) {
          const p = await profRes.json();
          if (p.countryId && p.cityId) setLocValue(`${p.countryId}|${p.cityId}`);
        }
      } catch {}
    }
    if (session?.user) load();
    return () => { cancelled = true; };
  }, [session?.user]);

  async function handleLocChange(val: string) {
    const normalized = val === LOC_NONE ? "" : val;
    setLocValue(normalized);
    const [countryId, cityId] = normalized.split("|");
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
        toast.success("Ubicación actualizada");
      }
    } catch {}
    setLocSaving(false);
  }

  const locationPicker = locations.length > 0 ? (
    <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
      <MapPin className="h-3.5 w-3.5 shrink-0 text-admin/60" />
      <Select value={locValue || LOC_NONE} onValueChange={handleLocChange}>
        <SelectTrigger className="h-auto min-w-0 flex-1 border-0 px-0 py-0 text-xs font-medium">
          <SelectValue placeholder="Seleccionar ubicación" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LOC_NONE}>Seleccionar ubicación</SelectItem>
          {locations.map((c) =>
            c.cities.map((city) => (
              <SelectItem key={city.id} value={`${c.id}|${city.id}`}>
                {countryFlag(c.code)} {city.name}
              </SelectItem>
            )),
          )}
        </SelectContent>
      </Select>
      {locSaving && <Loader2 className="h-3 w-3 animate-spin text-muted" />}
      {locSaved && <Check className="h-3 w-3 text-green-500" />}
    </div>
  ) : null;

  return (
    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="min-h-dvh bg-background">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-admin/10 bg-white/80 backdrop-blur-xl">
          <div className="h-1 bg-gradient-to-r from-admin/80 to-admin/30" />
          <div className="flex h-14 items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-3">
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl text-foreground hover:bg-admin/5 lg:hidden"
                  aria-label="Abrir menú"
                >
                  {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </SheetTrigger>
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
            <Button
              onClick={async () => { await signOut({ redirect: false }); window.location.href = window.location.origin; }}
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted hover:bg-red-50 hover:text-red-600"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </Button>
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

          {/* Main content */}
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>

        {/* Mobile sidebar via shadcn Sheet */}
        <SheetContent side="left" className="w-72 p-0 lg:hidden">
          <div className="flex h-full flex-col pt-16">
            <nav className="flex-1 space-y-0.5 p-3">
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
            </nav>
            {locationPicker && (
              <div className="border-t border-border/50 p-3">
                {locationPicker}
              </div>
            )}
            <div className="border-t border-border/50 p-3">
              <Link
                href="/"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-3 text-sm text-muted transition-colors hover:bg-surface"
              >
                <ArrowLeft className="h-5 w-5" />
                Sitio público
              </Link>
            </div>
          </div>
        </SheetContent>
      </div>
    </Sheet>
  );
}
