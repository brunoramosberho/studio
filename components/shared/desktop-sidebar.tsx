"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Home,
  Dumbbell,
  CalendarCheck,
  User,
  Users,
  Package,
  ShoppingBag,
  MapPin,
  Loader2,
  Check,
  ArrowRightLeft,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";
import { useTenant } from "@/components/tenant-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const sidebarLinks = [
  { href: "/my", icon: Home, labelKey: "feed" },
  { href: "/schedule", icon: Dumbbell, labelKey: "classes" },
  { href: "/coaches", icon: Users, labelKey: "coaches" },
  { href: "/my/bookings", icon: CalendarCheck, labelKey: "myBookings" },
  { href: "/my/packages", icon: Package, labelKey: "myPackages" },
  { href: "/shop", icon: ShoppingBag, labelKey: "shop" },
  { href: "/my/profile", icon: User, labelKey: "profile" },
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

export function DesktopSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { studioName, logoUrl } = useBranding();
  const { hasCoachProfile } = useTenant();
  const t = useTranslations("nav");
  const tc = useTranslations("common");

  const [locations, setLocations] = useState<LocCountry[]>([]);
  const [locValue, setLocValue] = useState("");
  const [locSaving, setLocSaving] = useState(false);
  const [locSaved, setLocSaved] = useState(false);

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

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border/50 bg-card md:block">
      <div className="flex h-full flex-col">
        <div className="p-6">
          <Link href="/" className="font-display text-2xl font-bold text-foreground">
            {logoUrl ? (
              <img src={logoUrl} alt={studioName} className="h-8 object-contain" />
            ) : (
              studioName
            )}
          </Link>
        </div>

        {session?.user && (
          <div className="mx-4 mb-4 rounded-xl bg-surface p-4">
            <p className="text-xs text-muted">{tc("welcomeBack")}</p>
            <p className="mt-0.5 font-display text-sm font-bold text-foreground">
              {session.user.name}
            </p>
          </div>
        )}

        <nav className="flex-1 space-y-1 px-3">
          {sidebarLinks.map((link) => {
            const isActive =
              link.href === "/my"
                ? pathname === "/my"
                : link.href === "/my/packages"
                  ? pathname.startsWith("/my/packages") || pathname.startsWith("/packages")
                  : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                <link.icon className={cn("h-[18px] w-[18px]", isActive && "stroke-[2.5]")} />
                {t(link.labelKey)}
              </Link>
            );
          })}
        </nav>

        {locations.flatMap((c) => c.cities).length > 1 && (
          <div className="border-t border-border/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" />
              <select
                value={locValue}
                onChange={(e) => handleLocChange(e.target.value)}
                className="min-w-0 flex-1 appearance-none bg-transparent text-xs font-medium text-foreground outline-none"
              >
                <option value="">{tc("selectLocation")}</option>
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
          </div>
        )}

        {hasCoachProfile && (
          <div className="border-t border-border/50 px-3 py-3">
            <Link
              href="/coach"
              className="flex items-center gap-2.5 rounded-xl border border-coach/20 bg-coach/5 px-3 py-2.5 text-sm font-medium text-coach transition-colors hover:bg-coach/10"
            >
              <ArrowRightLeft className="h-4 w-4" />
              {t("coachPortal")}
            </Link>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border/50 px-4 py-3">
          <p className="text-[10px] text-muted/50">{studioName} Studio · {tc("portal")}</p>
          <ThemeToggle variant="icon" />
        </div>
      </div>
    </aside>
  );
}
