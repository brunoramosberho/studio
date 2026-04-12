"use client";

import Link from "next/link";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
  Link2,
  ShoppingBag,
  Globe2,
  ArrowRightLeft,
  Trophy,
  FileSignature,
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
  ChevronRight,
  ChevronDown,
  Settings,
  Briefcase,
  TrendingUp,
  Target,
  CreditCard,
  CalendarSync,
  Wallet,
  Ticket,
  Gift,
} from "lucide-react";
import { SparklesIcon, type SparklesIconHandle } from "lucide-animated";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useBranding } from "@/components/branding-provider";
import { CreateClientDialog } from "@/components/admin/create-client-dialog";
import { MgicAIProvider, useMgicAI } from "@/components/admin/MgicAI";
import { PosDialog } from "@/components/admin/pos/pos-dialog";
import { usePosStore } from "@/store/pos-store";
import { type AdminPermission, hasPermission } from "@/lib/permissions";
import type { Role } from "@prisma/client";

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  permission?: AdminPermission;
  badgeKey?: "pendingWaitlist" | "newClients" | "recentFeed";
  contextKey?: "activeClasses";
}

interface FlyoutGroup {
  labelKey: string;
  icon: LucideIcon;
  permission?: AdminPermission;
  items: NavItem[];
}

const directItems: NavItem[] = [
  { href: "/admin", labelKey: "dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { href: "/admin/schedule", labelKey: "schedule", icon: CalendarDays, permission: "schedule", badgeKey: "pendingWaitlist" },
  { href: "/admin/classes", labelKey: "classes", icon: ClipboardList, permission: "classes", contextKey: "activeClasses" },
  { href: "/admin/check-in", labelKey: "checkIn", icon: ClipboardCheck, permission: "checkIn" },
  { href: "/admin/clients", labelKey: "clients", icon: Users, permission: "clients", badgeKey: "newClients" },
  { href: "/admin/feed", labelKey: "feed", icon: Megaphone, permission: "feed", badgeKey: "recentFeed" },
  { href: "/admin/gamification", labelKey: "achievements", icon: Trophy, permission: "achievements" },
  { href: "#pos", labelKey: "pos", icon: ShoppingBag, permission: "pos" },
];

const flyoutGroups: FlyoutGroup[] = [
  {
    labelKey: "team",
    icon: Users,
    permission: "coaches",
    items: [
      { href: "/admin/coaches", labelKey: "coaches", icon: UserCog, permission: "coaches" },
      { href: "/admin/availability", labelKey: "availability", icon: CalendarOff, permission: "availability" },
      { href: "/admin/class-types", labelKey: "disciplines", icon: Dumbbell, permission: "disciplines" },
    ],
  },
  {
    labelKey: "business",
    icon: Briefcase,
    permission: "finance",
    items: [
      { href: "/admin/finance", labelKey: "finance", icon: Wallet, permission: "finance" },
      { href: "/admin/packages", labelKey: "packages", icon: Package, permission: "packages" },
      { href: "/admin/discounts", labelKey: "discounts", icon: Ticket, permission: "packages" },
      { href: "/admin/gift-packages", labelKey: "giftPackages", icon: Gift, permission: "packages" },
      { href: "/admin/subscriptions", labelKey: "subscriptions", icon: CalendarSync, permission: "subscriptions" },
      { href: "/admin/shop", labelKey: "store", icon: ShoppingBag, permission: "shop" },
      { href: "/admin/platforms", labelKey: "platforms", icon: Globe2, permission: "platforms" },
    ],
  },
  {
    labelKey: "metrics",
    icon: TrendingUp,
    permission: "reports",
    items: [
      { href: "/admin/reports", labelKey: "reports", icon: BarChart3, permission: "reports" },
      { href: "/admin/analytics", labelKey: "performance", icon: Activity, permission: "analytics" },
      { href: "/admin/conversion", labelKey: "conversion", icon: ArrowRightLeft, permission: "conversion" },
    ],
  },
  {
    labelKey: "marketing",
    icon: Target,
    permission: "marketing",
    items: [
      { href: "/admin/marketing", labelKey: "linksUtm", icon: Link2, permission: "marketing" },
      { href: "/admin/marketing/highlights", labelKey: "highlights", icon: Sparkles, permission: "highlights" },
      { href: "/admin/settings/referrals", labelKey: "referrals", icon: Users, permission: "referrals" },
    ],
  },
  {
    labelKey: "settings",
    icon: Settings,
    permission: "billing",
    items: [
      { href: "/admin/settings/billing", labelKey: "billing", icon: CreditCard, permission: "billing" },
      { href: "/admin/waiver", labelKey: "waiver", icon: FileSignature, permission: "waiver" },
      { href: "/admin/branding", labelKey: "branding", icon: Palette, permission: "branding" },
      { href: "/admin/team", labelKey: "team", icon: ShieldCheck, permission: "team" },
      { href: "/admin/studios", labelKey: "studios", icon: Building2, permission: "studios" },
      { href: "/admin/settings/language", labelKey: "language", icon: Globe2, permission: "language" },
    ],
  },
];

interface SidebarStats {
  activeClasses: number;
  pendingWaitlist: number;
  newClients: number;
  recentFeed: number;
}

function useAdminRole() {
  const [role, setRole] = useState<Role>("ADMIN");
  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.role && setRole(d.role as Role))
      .catch(() => {});
  }, []);
  return role;
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

function SidebarFlyoutGroup({
  group,
  stats,
  pathname,
  isOpen,
  onOpen,
  onClose,
}: {
  group: FlyoutGroup;
  stats: SidebarStats | null;
  pathname: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin");
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const hasActiveChild = group.items.some((item) => isActive(item.href));

  const handleEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.top, left: rect.right + 4 });
    }
    onOpen();
  };

  return (
    <div ref={triggerRef} onMouseEnter={handleEnter} onMouseLeave={onClose}>
      <div
        className={cn(
          "group flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors cursor-default select-none",
          hasActiveChild || isOpen
            ? "bg-admin/8 font-semibold text-admin"
            : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
        )}
      >
        <group.icon
          className={cn(
            "h-4 w-4 shrink-0",
            hasActiveChild || isOpen
              ? "text-admin"
              : "text-foreground/40 group-hover:text-foreground/60",
          )}
          strokeWidth={hasActiveChild ? 2.25 : 1.75}
        />
        <span className="flex-1 truncate">{t(group.labelKey)}</span>
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            isOpen && "translate-x-0.5",
            hasActiveChild || isOpen ? "text-admin/50" : "text-foreground/25",
          )}
        />
      </div>

      {isOpen &&
        createPortal(
          <div
            className="fixed z-50 min-w-[200px] rounded-md border border-border/50 bg-white py-1.5 shadow-lg"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={handleEnter}
            onMouseLeave={onClose}
          >
            <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-muted/50">
              {t(group.labelKey)}
            </p>
            {group.items.map((item) => {
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
                  className={cn(
                    "group flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-medium transition-colors",
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
                  <span className="flex-1 truncate">{t(item.labelKey)}</span>
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
          </div>,
          document.body,
        )}
    </div>
  );
}

function MobileAccordionGroup({
  group,
  stats,
  pathname,
  onNavigate,
  py,
}: {
  group: FlyoutGroup;
  stats: SidebarStats | null;
  pathname: string;
  onNavigate?: () => void;
  py: string;
}) {
  const t = useTranslations("admin");
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const hasActiveChild = group.items.some((item) => isActive(item.href));
  const [expanded, setExpanded] = useState(hasActiveChild);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-[13px] font-medium transition-colors",
          py,
          hasActiveChild
            ? "bg-admin/8 font-semibold text-admin"
            : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
        )}
      >
        <group.icon
          className={cn(
            "h-4 w-4 shrink-0",
            hasActiveChild ? "text-admin" : "text-foreground/40 group-hover:text-foreground/60",
          )}
          strokeWidth={hasActiveChild ? 2.25 : 1.75}
        />
        <span className="flex-1 truncate">{t(group.labelKey)}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-200",
            expanded && "rotate-180",
            hasActiveChild ? "text-admin/50" : "text-foreground/25",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-4 space-y-px py-0.5">
              {group.items.map((item) => {
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
                    <span className="flex-1 truncate">{t(item.labelKey)}</span>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MgicAIButton() {
  const { toggle, isOpen } = useMgicAI();
  const { colorAdmin } = useBranding();
  const sparklesRef = useRef<SparklesIconHandle>(null);
  const tc = useTranslations("common");

  return (
    <button
      onClick={toggle}
      onMouseEnter={() => sparklesRef.current?.startAnimation()}
      onMouseLeave={() => sparklesRef.current?.stopAnimation()}
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
        <SparklesIcon ref={sparklesRef} size={14} />
      </span>
      <span className="flex-1">Mgic AI</span>
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
          isOpen ? "bg-admin/10 text-admin" : "bg-white/20 text-white/90",
        )}
      >
        {tc("new")}
      </span>
    </button>
  );
}

function SidebarNav({
  stats,
  pathname,
  onNavigate,
  mobile,
  role,
}: {
  stats: SidebarStats | null;
  pathname: string;
  onNavigate?: () => void;
  mobile?: boolean;
  role: Role;
}) {
  const t = useTranslations("admin");
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const py = mobile ? "py-2" : "py-1.5";

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const flyoutTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openFlyout = (label: string) => {
    if (flyoutTimeout.current) {
      clearTimeout(flyoutTimeout.current);
      flyoutTimeout.current = null;
    }
    setOpenGroup(label);
  };

  const closeFlyout = () => {
    flyoutTimeout.current = setTimeout(() => setOpenGroup(null), 150);
  };

  useEffect(() => {
    return () => {
      if (flyoutTimeout.current) clearTimeout(flyoutTimeout.current);
    };
  }, []);

  return (
    <>
      <div className="space-y-px">
        {directItems.filter((item) => !item.permission || hasPermission(role, item.permission)).map((item) => {
          const active = isActive(item.href);
          const badgeVal = item.badgeKey && stats ? stats[item.badgeKey] : 0;
          const contextVal =
            item.contextKey === "activeClasses" && stats?.activeClasses
              ? `${stats.activeClasses} activas`
              : null;

          if (item.href === "#pos") {
            return <PosSidebarButton key={item.href} py={py} onNavigate={onNavigate} />;
          }

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
              <span className="flex-1 truncate">{t(item.labelKey)}</span>
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

      <div className="mt-4 space-y-px">
        {flyoutGroups.filter((g) => !g.permission || hasPermission(role, g.permission)).map((group) =>
          mobile ? (
            <MobileAccordionGroup
              key={group.labelKey}
              group={group}
              stats={stats}
              pathname={pathname}
              onNavigate={onNavigate}
              py={py}
            />
          ) : (
            <SidebarFlyoutGroup
              key={group.labelKey}
              group={group}
              stats={stats}
              pathname={pathname}
              isOpen={openGroup === group.labelKey}
              onOpen={() => openFlyout(group.labelKey)}
              onClose={closeFlyout}
            />
          ),
        )}
      </div>
    </>
  );
}

function PosSidebarButton({ py, onNavigate }: { py: string; onNavigate?: () => void }) {
  const { openPOS } = usePosStore();
  const t = useTranslations("admin");
  return (
    <button
      onClick={() => {
        openPOS();
        onNavigate?.();
      }}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-[13px] font-medium transition-colors text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
        py,
      )}
    >
      <ShoppingBag className="h-4 w-4 shrink-0 text-foreground/40 group-hover:text-foreground/60" strokeWidth={1.75} />
      <span className="truncate">{t("pos")}</span>
    </button>
  );
}

function PosHeaderButton() {
  const { openPOS } = usePosStore();
  return (
    <button
      onClick={() => openPOS()}
      className="hidden items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground sm:flex"
    >
      <ShoppingBag className="h-3.5 w-3.5" />
      POS
    </button>
  );
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const { studioName } = useBranding();
  const stats = useSidebarStats();
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const role = useAdminRole();

  const [locations, setLocations] = useState<LocCountry[]>([]);
  const [locValue, setLocValue] = useState("");
  const [locSaving, setLocSaving] = useState(false);
  const [locSaved, setLocSaved] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

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

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-admin" />
          <p className="text-sm text-muted">{tc("loadingSession")}</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  const userName = session?.user?.name ?? "Admin";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

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
                {t("portal")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick actions -- hidden on mobile */}
            <span className="hidden text-xs text-muted/70 sm:inline">{t("addLabel")}</span>
            <button
              onClick={() => setShowCreateClient(true)}
              className="hidden items-center gap-1.5 rounded-sm border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface sm:flex"
            >
              <UserPlus className="h-3.5 w-3.5 text-admin" />
              {t("customer")}
            </button>

            <div className="mx-1 hidden h-5 w-px bg-border/50 sm:block" />

            <PosHeaderButton />
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

            <Link href="/admin/profile" title={t("myProfile")}>
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
              title={tc("logout")}
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
              <SidebarNav stats={stats} pathname={pathname} role={role} />
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
                {t("myProfile")}
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
                    stats={stats}
                    pathname={pathname}
                    onNavigate={() => setSidebarOpen(false)}
                    mobile
                    role={role}
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
                    {t("myProfile")}
                  </Link>
                  {locationPicker}
                  <Link
                    href="/"
                    onClick={() => setSidebarOpen(false)}
                    className="mt-2 flex items-center gap-2.5 rounded-sm border border-border/50 px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-foreground/[0.03]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {tc("publicSite")}
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
      <PosDialog />
    </div>
    </MgicAIProvider>
  );
}

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth-admin">
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </SessionProvider>
  );
}
