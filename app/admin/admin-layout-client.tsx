"use client";

import Link from "next/link";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarOff,
  Dumbbell,
  ClipboardCheck,
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
  Settings2,
  TrendingUp,
  Wallet,
  Video,
  Coffee,
  Tag,
  Search,
  Command,
  Home,
  GraduationCap,
  Sliders,
  Clock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useBranding } from "@/components/branding-provider";
import { CreateClientDialog } from "@/components/admin/create-client-dialog";
import { StaffClockInWidget } from "@/components/staff/clock-in-widget";
import { MgicAIProvider, useMgicAI } from "@/components/admin/MgicAI";
import { PosDialog } from "@/components/admin/pos/pos-dialog";
import { usePosStore } from "@/store/pos-store";
import { type AdminPermission, hasPermission } from "@/lib/permissions";
import {
  CommandPalette,
  type PaletteItem,
  type TenantFlags,
} from "@/components/admin/command-palette";
import type { Role } from "@prisma/client";

type FeatureFlag = keyof TenantFlags;

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  permission?: AdminPermission;
  feature?: FeatureFlag;
  badgeKey?: "pendingWaitlist" | "newClients" | "recentFeed" | "pendingNoShows" | "activeOrders";
  contextKey?: "activeClasses";
  keywordsKey?: string;
  match?: (pathname: string) => boolean;
}

interface NavGroup {
  labelKey: string;
  icon: LucideIcon;
  permission?: AdminPermission;
  items: NavItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar configuration — single source of truth
// ─────────────────────────────────────────────────────────────────────────────

const directItems: NavItem[] = [
  { href: "/admin", labelKey: "dashboard", icon: LayoutDashboard, permission: "dashboard", keywordsKey: "kw.dashboard" },
  { href: "/admin/schedule", labelKey: "schedule", icon: CalendarDays, permission: "schedule", badgeKey: "pendingWaitlist", contextKey: "activeClasses", keywordsKey: "kw.schedule", match: (p) => p.startsWith("/admin/schedule") || p.startsWith("/admin/classes") || p.startsWith("/admin/class/") },
  { href: "/admin/check-in", labelKey: "checkIn", icon: ClipboardCheck, permission: "checkIn", badgeKey: "pendingNoShows", keywordsKey: "kw.checkIn", match: (p) => p.startsWith("/admin/check-in") || p.startsWith("/admin/no-shows") },
  { href: "/admin/clients", labelKey: "clients", icon: Users, permission: "clients", badgeKey: "newClients", keywordsKey: "kw.clients" },
  { href: "/admin/feed", labelKey: "memberHome", icon: Home, permission: "feed", badgeKey: "recentFeed", keywordsKey: "kw.memberHome" },
  { href: "/admin/orders", labelKey: "orders", icon: Coffee, permission: "orders", feature: "orders", badgeKey: "activeOrders", keywordsKey: "kw.orders" },
  { href: "#pos", labelKey: "pos", icon: ShoppingBag, permission: "pos", keywordsKey: "kw.pos" },
];

const navGroups: NavGroup[] = [
  {
    labelKey: "groups.studio",
    icon: Building2,
    permission: "studios",
    items: [
      { href: "/admin/studios", labelKey: "locations", icon: Building2, permission: "studios", keywordsKey: "kw.locations" },
      { href: "/admin/coaches", labelKey: "coaches", icon: UserCog, permission: "coaches", keywordsKey: "kw.coaches" },
      { href: "/admin/class-types", labelKey: "disciplines", icon: Dumbbell, permission: "disciplines", keywordsKey: "kw.disciplines" },
      { href: "/admin/team", labelKey: "staffPermissions", icon: ShieldCheck, permission: "team", keywordsKey: "kw.staff" },
      { href: "/admin/staff", labelKey: "staffManagement", icon: Clock, permission: "staffManagement", keywordsKey: "kw.staffManagement" },
    ],
  },
  {
    labelKey: "groups.sales",
    icon: Tag,
    permission: "packages",
    items: [
      { href: "/admin/packages", labelKey: "pricing", icon: Package, permission: "packages", keywordsKey: "kw.pricing" },
      { href: "/admin/shop", labelKey: "store", icon: ShoppingBag, permission: "shop", feature: "shop", keywordsKey: "kw.shop" },
      { href: "/admin/on-demand", labelKey: "onDemand.title", icon: Video, permission: "onDemand", feature: "onDemand", keywordsKey: "kw.onDemand" },
    ],
  },
  {
    labelKey: "groups.finance",
    icon: Wallet,
    permission: "finance",
    items: [
      { href: "/admin/finance", labelKey: "finance", icon: Wallet, permission: "finance", keywordsKey: "kw.finance" },
      { href: "/admin/settings/billing", labelKey: "billing", icon: Sliders, permission: "billing", keywordsKey: "kw.billing" },
    ],
  },
  {
    labelKey: "groups.growth",
    icon: TrendingUp,
    permission: "reports",
    items: [
      { href: "/admin/reports", labelKey: "insights", icon: BarChart3, permission: "reports", keywordsKey: "kw.insights" },
      { href: "/admin/marketing", labelKey: "acquisition", icon: Megaphone, permission: "marketing", keywordsKey: "kw.acquisition" },
      { href: "/admin/gamification", labelKey: "achievements", icon: GraduationCap, permission: "achievements", feature: "achievements", keywordsKey: "kw.achievements" },
    ],
  },
  {
    labelKey: "groups.config",
    icon: Settings2,
    permission: "branding",
    items: [
      { href: "/admin/branding", labelKey: "studioConfig", icon: Palette, permission: "branding", keywordsKey: "kw.studioConfig" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Palette items derived from sidebar + extra deep links
// ─────────────────────────────────────────────────────────────────────────────

function buildPaletteItems(openPos: () => void, openCreateClient: () => void): PaletteItem[] {
  const fromSidebar: PaletteItem[] = [];
  for (const item of directItems) {
    fromSidebar.push({
      id: `direct:${item.href}`,
      labelKey: item.labelKey,
      groupKey: "groups.daily",
      icon: item.icon,
      href: item.href === "#pos" ? undefined : item.href,
      action: item.href === "#pos" ? openPos : undefined,
      keywordsKey: item.keywordsKey,
      permission: item.permission,
    });
  }
  for (const group of navGroups) {
    for (const item of group.items) {
      fromSidebar.push({
        id: `group:${group.labelKey}:${item.href}`,
        labelKey: item.labelKey,
        groupKey: group.labelKey,
        icon: item.icon,
        href: item.href,
        keywordsKey: item.keywordsKey,
        permission: item.permission,
        feature: item.feature,
      });
    }
  }
  // Deep links — internal pages reachable from within consolidated sections
  const deepLinks: PaletteItem[] = [
    { id: "deep:classes-list", labelKey: "tabs.classesList", groupKey: "groups.daily", icon: ClipboardList, href: "/admin/classes", permission: "classes", keywordsKey: "kw.classesList" },
    { id: "deep:no-shows", labelKey: "tabs.noShows", groupKey: "groups.daily", icon: ClipboardCheck, href: "/admin/no-shows", permission: "noShowReview", feature: "noShows", keywordsKey: "kw.noShows" },
    { id: "deep:highlights", labelKey: "tabs.highlights", groupKey: "groups.daily", icon: Sparkles, href: "/admin/marketing/highlights", permission: "highlights", feature: "highlights", keywordsKey: "kw.highlights" },
    { id: "deep:availability", labelKey: "tabs.availability", groupKey: "groups.studio", icon: CalendarOff, href: "/admin/availability", permission: "availability", keywordsKey: "kw.availability" },
    { id: "deep:platforms", labelKey: "tabs.platforms", groupKey: "groups.studio", icon: Building2, href: "/admin/platforms", permission: "platforms", feature: "platforms", keywordsKey: "kw.platforms" },
    { id: "deep:subscriptions", labelKey: "tabs.subscriptions", groupKey: "groups.sales", icon: Package, href: "/admin/subscriptions", permission: "subscriptions", keywordsKey: "kw.subscriptions" },
    { id: "deep:discounts", labelKey: "tabs.discounts", groupKey: "groups.sales", icon: Package, href: "/admin/discounts", permission: "packages", keywordsKey: "kw.discounts" },
    { id: "deep:gifts", labelKey: "tabs.gifts", groupKey: "groups.sales", icon: Package, href: "/admin/gift-packages", permission: "packages", keywordsKey: "kw.gifts" },
    { id: "deep:revenue-recognition", labelKey: "tabs.revenueRecognition", groupKey: "groups.finance", icon: TrendingUp, href: "/admin/finance/recognition", permission: "finance", keywordsKey: "kw.revenueRec" },
    { id: "deep:analytics", labelKey: "tabs.performance", groupKey: "groups.growth", icon: BarChart3, href: "/admin/analytics", permission: "analytics", keywordsKey: "kw.analytics" },
    { id: "deep:conversion", labelKey: "tabs.conversion", groupKey: "groups.growth", icon: TrendingUp, href: "/admin/conversion", permission: "conversion", keywordsKey: "kw.conversion" },
    { id: "deep:referrals", labelKey: "tabs.referrals", groupKey: "groups.growth", icon: Users, href: "/admin/settings/referrals", permission: "referrals", feature: "referrals", keywordsKey: "kw.referrals" },
    { id: "deep:policies", labelKey: "tabs.policies", groupKey: "groups.config", icon: Sliders, href: "/admin/settings/policies", permission: "policies", keywordsKey: "kw.policies" },
    { id: "deep:waiver", labelKey: "tabs.waiver", groupKey: "groups.config", icon: Sliders, href: "/admin/waiver", permission: "waiver", keywordsKey: "kw.waiver" },
    { id: "deep:embed", labelKey: "tabs.embed", groupKey: "groups.config", icon: Sliders, href: "/admin/settings/embed", permission: "embed", keywordsKey: "kw.embed" },
    { id: "deep:language", labelKey: "tabs.language", groupKey: "groups.config", icon: Sliders, href: "/admin/settings/language", permission: "language", keywordsKey: "kw.language" },
  ];
  // Quick actions
  const actions: PaletteItem[] = [
    {
      id: "action:create-client",
      labelKey: "commandPalette.actionCreateClient",
      groupKey: "commandPalette.actions",
      icon: UserPlus,
      action: openCreateClient,
      keywordsKey: "kw.createClient",
      permission: "clients",
    },
    {
      id: "action:open-pos",
      labelKey: "commandPalette.actionOpenPos",
      groupKey: "commandPalette.actions",
      icon: ShoppingBag,
      action: openPos,
      keywordsKey: "kw.pos",
      permission: "pos",
    },
  ];
  return [...actions, ...fromSidebar, ...deepLinks];
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats hook
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarStats {
  activeClasses: number;
  pendingWaitlist: number;
  newClients: number;
  recentFeed: number;
  pendingNoShows: number;
  activeOrders: number;
  flags: TenantFlags;
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

function getBadgeVal(item: NavItem, stats: SidebarStats | null): number {
  if (!item.badgeKey || !stats) return 0;
  switch (item.badgeKey) {
    case "pendingWaitlist": return stats.pendingWaitlist;
    case "newClients": return stats.newClients;
    case "recentFeed": return stats.recentFeed;
    case "pendingNoShows": return stats.pendingNoShows;
    case "activeOrders": return stats.activeOrders;
    default: return 0;
  }
}

function getContextLabel(item: NavItem, stats: SidebarStats | null, t: (key: string, values?: Record<string, string | number>) => string): string | null {
  if (item.contextKey === "activeClasses" && stats?.activeClasses) {
    return t("activeShort", { count: stats.activeClasses });
  }
  return null;
}

function filterNavItems(items: NavItem[], role: Role, flags: TenantFlags | null): NavItem[] {
  return items.filter((i) => {
    if (i.permission && !hasPermission(role, i.permission)) return false;
    if (i.feature && flags && !flags[i.feature]) return false;
    return true;
  });
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname);
  if (item.href === "/admin") return pathname === "/admin";
  if (item.href === "#pos") return false;
  return pathname.startsWith(item.href);
}

function SidebarFlyoutGroup({
  group,
  stats,
  pathname,
  role,
  isOpen,
  onOpen,
  onClose,
}: {
  group: NavGroup;
  stats: SidebarStats | null;
  pathname: string;
  role: Role;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin");
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const visibleItems = filterNavItems(group.items, role, stats?.flags ?? null);

  const hasActiveChild = visibleItems.some((item) => isItemActive(item, pathname));

  if (visibleItems.length === 0) return null;

  // Collapse a single-child group into a direct link — no flyout needed.
  if (visibleItems.length === 1) {
    const item = visibleItems[0];
    const active = isItemActive(item, pathname);
    const badgeVal = getBadgeVal(item, stats);
    const contextVal = getContextLabel(item, stats, t);
    return (
      <Link
        href={item.href}
        className={cn(
          "group flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors",
          active
            ? "bg-admin/8 font-semibold text-admin"
            : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
        )}
      >
        <group.icon
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-admin" : "text-foreground/40 group-hover:text-foreground/60",
          )}
          strokeWidth={active ? 2.25 : 1.75}
        />
        <span className="flex-1 truncate">{t(group.labelKey)}</span>
        {badgeVal ? (
          <Badge count={badgeVal} variant={item.badgeKey === "newClients" ? "green" : "red"} />
        ) : contextVal ? (
          <ContextTag label={contextVal} />
        ) : null}
      </Link>
    );
  }

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
            className="fixed z-50 min-w-[220px] rounded-md border border-border/50 bg-card py-1.5 shadow-lg"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={handleEnter}
            onMouseLeave={onClose}
          >
            <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-muted/50">
              {t(group.labelKey)}
            </p>
            {visibleItems.map((item) => {
              const active = isItemActive(item, pathname);
              const badgeVal = getBadgeVal(item, stats);
              const contextVal = getContextLabel(item, stats, t);

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
  role,
  onNavigate,
  py,
}: {
  group: NavGroup;
  stats: SidebarStats | null;
  pathname: string;
  role: Role;
  onNavigate?: () => void;
  py: string;
}) {
  const t = useTranslations("admin");
  const visibleItems = filterNavItems(group.items, role, stats?.flags ?? null);

  const hasActiveChild = visibleItems.some((item) => isItemActive(item, pathname));
  const [expanded, setExpanded] = useState(hasActiveChild);

  if (visibleItems.length === 0) return null;

  // Collapse a single-child group into a direct link — no accordion needed.
  if (visibleItems.length === 1) {
    const item = visibleItems[0];
    const active = isItemActive(item, pathname);
    const badgeVal = getBadgeVal(item, stats);
    const contextVal = getContextLabel(item, stats, t);
    return (
      <Link
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
        <group.icon
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-admin" : "text-foreground/40 group-hover:text-foreground/60",
          )}
          strokeWidth={active ? 2.25 : 1.75}
        />
        <span className="flex-1 truncate">{t(group.labelKey)}</span>
        {badgeVal ? (
          <Badge count={badgeVal} variant={item.badgeKey === "newClients" ? "green" : "red"} />
        ) : contextVal ? (
          <ContextTag label={contextVal} />
        ) : null}
      </Link>
    );
  }

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
              {visibleItems.map((item) => {
                const active = isItemActive(item, pathname);
                const badgeVal = getBadgeVal(item, stats);
                const contextVal = getContextLabel(item, stats, t);

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

  return (
    <button
      onClick={toggle}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-[13px] font-semibold transition-all",
        isOpen
          ? "bg-admin/10 text-admin ring-1 ring-admin/20"
          : "text-white hover:brightness-110",
      )}
      style={isOpen ? undefined : { backgroundColor: colorAdmin }}
    >
      <img
        src="/spark-avatar.png"
        alt="Spark"
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
      <span className="flex-1">Spark</span>
    </button>
  );
}

const subscribeNoop = () => () => {};
function useIsMac(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => /Mac|iPod|iPhone|iPad/.test(navigator.platform),
    () => true,
  );
}

function SearchTrigger({ onClick }: { onClick: () => void }) {
  const t = useTranslations("admin");
  const isMac = useIsMac();
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-sm border border-border/50 bg-surface/50 px-2 py-1.5 text-left text-[12px] text-muted transition-colors hover:border-admin/30 hover:bg-admin/5"
    >
      <Search className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{t("commandPalette.trigger")}</span>
      <kbd className="rounded border border-border/40 px-1 py-px text-[10px] font-medium tabular-nums">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
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

  const visibleDirect = filterNavItems(directItems, role, stats?.flags ?? null);

  return (
    <>
      <div className="space-y-px">
        {visibleDirect.map((item) => {
          const active = isItemActive(item, pathname);
          const badgeVal = getBadgeVal(item, stats);
          const contextVal = getContextLabel(item, stats, t);

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
        {navGroups.map((group) =>
          mobile ? (
            <MobileAccordionGroup
              key={group.labelKey}
              group={group}
              stats={stats}
              pathname={pathname}
              role={role}
              onNavigate={onNavigate}
              py={py}
            />
          ) : (
            <SidebarFlyoutGroup
              key={group.labelKey}
              group={group}
              stats={stats}
              pathname={pathname}
              role={role}
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
  const t = useTranslations("admin");
  const { openPOS } = usePosStore();
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

function PaletteHeaderButton({ onClick }: { onClick: () => void }) {
  const isMac = useIsMac();
  return (
    <button
      onClick={onClick}
      className="hidden items-center gap-1.5 rounded-sm border border-border/50 bg-surface/30 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-admin/30 hover:bg-admin/5 hover:text-foreground sm:flex"
      title="Search (⌘K)"
    >
      <Command className="h-3.5 w-3.5" />
      <kbd className="text-[10px] tabular-nums">{isMac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { studioName } = useBranding();
  const stats = useSidebarStats();
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const role = useAdminRole();
  const { openPOS } = usePosStore();

  const [locations, setLocations] = useState<LocCountry[]>([]);
  const [locValue, setLocValue] = useState("");
  const [locSaving, setLocSaving] = useState(false);
  const [locSaved, setLocSaved] = useState(false);

  const paletteItems = useMemo(
    () => buildPaletteItems(() => openPOS(), () => setShowCreateClient(true)),
    [openPOS],
  );

  // Verify-before-redirect: when nested SessionProviders share next-auth's
  // module-level singleton (one for the client portal in app/providers.tsx,
  // one here for the admin portal), `useSession()` can transiently report
  // `unauthenticated` even though the admin cookie is still valid — that bug
  // was kicking admins out of /admin/platforms and /admin/settings/embed.
  // Confirm with a direct fetch to /api/auth-admin/session before redirecting,
  // and pass `portal=admin` + `callbackUrl` so the user lands back where they
  // were instead of on the client login.
  useEffect(() => {
    if (status !== "unauthenticated") return;
    let cancelled = false;
    const verify = async () => {
      try {
        const res = await fetch("/api/auth-admin/session", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        const data = res.ok ? await res.json() : null;
        if (data && (data as { user?: unknown }).user) return; // false alarm
        const target = `/login?portal=admin&callbackUrl=${encodeURIComponent(
          pathname || "/admin",
        )}`;
        router.replace(target);
      } catch {
        // Network blip — don't kick the user out
      }
    };
    const t = setTimeout(verify, 800);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [status, router, pathname]);

  // Global keyboard shortcut for the palette
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  // Treat "unauthenticated" the same as "loading" until the verification
  // effect above either confirms the user is gone (it redirects) or learns it
  // was a false alarm (status flips back to "authenticated").
  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-admin" />
          <p className="text-sm text-muted">{tc("loadingSession")}</p>
        </div>
      </div>
    );
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
      <header className="sticky top-0 z-40 border-b border-admin/10 bg-card/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
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
            <PaletteHeaderButton onClick={() => setPaletteOpen(true)} />

            <div className="mx-1 hidden h-5 w-px bg-border/50 sm:block" />

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
        <aside className="hidden w-56 shrink-0 border-r border-border/40 bg-card lg:block">
          <div className="sticky top-[calc(3.5rem+4px)] flex h-[calc(100dvh-3.5rem-4px)] flex-col">
            {/* Spark AI protagonist */}
            <div className="p-3 pb-0">
              <MgicAIButton />
            </div>

            {/* Search trigger */}
            <div className="px-3 pt-2">
              <SearchTrigger onClick={() => setPaletteOpen(true)} />
            </div>

            {/* Clock in/out widget (FRONT_DESK + ADMIN only; the widget
                self-hides for other roles). */}
            <div className="px-3 pt-2">
              <StaffClockInWidget />
            </div>

            {/* Scrollable nav sections */}
            <nav className="flex-1 overflow-y-auto p-3 pt-3">
              <SidebarNav stats={stats} pathname={pathname} role={role} />
            </nav>

            {/* Bottom: profile + location */}
            <div className="border-t border-border/40 p-3 space-y-1">
              {role === "FRONT_DESK" && (
                <Link
                  href="/admin/me/timesheet"
                  className={cn(
                    "flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    pathname === "/admin/me/timesheet"
                      ? "bg-admin/8 font-semibold text-admin"
                      : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  <Clock
                    className={cn("h-4 w-4", pathname === "/admin/me/timesheet" ? "text-admin" : "text-foreground/40")}
                    strokeWidth={pathname === "/admin/me/timesheet" ? 2.25 : 1.75}
                  />
                  Mi tiempo y nómina
                </Link>
              )}
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
                className="fixed left-0 top-0 z-40 flex h-dvh w-64 flex-col border-r border-border/40 bg-card pt-16 shadow-warm-lg lg:hidden"
              >
                <div className="px-3 pt-4 pb-1">
                  <MgicAIButton />
                </div>

                <div className="px-3 pt-2">
                  <SearchTrigger
                    onClick={() => {
                      setSidebarOpen(false);
                      setPaletteOpen(true);
                    }}
                  />
                </div>

                <div className="px-3 pt-2">
                  <StaffClockInWidget />
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
                  {role === "FRONT_DESK" && (
                    <Link
                      href="/admin/me/timesheet"
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] font-medium transition-colors",
                        pathname === "/admin/me/timesheet"
                          ? "bg-admin/8 font-semibold text-admin"
                          : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
                      )}
                    >
                      <Clock
                        className={cn("h-4 w-4", pathname === "/admin/me/timesheet" ? "text-admin" : "text-foreground/40")}
                        strokeWidth={pathname === "/admin/me/timesheet" ? 2.25 : 1.75}
                      />
                      Mi tiempo y nómina
                    </Link>
                  )}
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
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={paletteItems}
        role={role}
        flags={stats?.flags ?? null}
      />
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
