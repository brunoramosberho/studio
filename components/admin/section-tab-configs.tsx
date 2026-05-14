import {
  Wallet,
  TrendingUp,
  Package,
  Ticket,
  Gift,
  CalendarSync,
  CalendarDays,
  ClipboardList,
  BarChart3,
  Activity,
  ArrowRightLeft,
  Megaphone,
  Sparkles,
  Users,
  ClipboardCheck,
  ShieldAlert,
  UserCog,
  CalendarOff,
  Link2,
  Palette,
  FileSignature,
  Globe2,
  Code2,
  Building2,
} from "lucide-react";
import type { SectionTab } from "./section-tabs";

export const SCHEDULE_TABS: SectionTab[] = [
  { href: "/admin/schedule", labelKey: "tabs.calendar", icon: CalendarDays },
  { href: "/admin/classes", labelKey: "tabs.classesList", icon: ClipboardList },
];

export const PRICING_TABS: SectionTab[] = [
  { href: "/admin/packages", labelKey: "tabs.packages", icon: Package },
  { href: "/admin/subscriptions", labelKey: "tabs.subscriptions", icon: CalendarSync },
  { href: "/admin/discounts", labelKey: "tabs.discounts", icon: Ticket },
  { href: "/admin/gift-packages", labelKey: "tabs.gifts", icon: Gift },
];

export const PRICING_CATALOG_TABS: SectionTab[] = [
  { href: "/admin/packages", labelKey: "tabs.packages", icon: Package },
  { href: "/admin/discounts", labelKey: "tabs.discounts", icon: Ticket },
  { href: "/admin/gift-packages", labelKey: "tabs.gifts", icon: Gift },
];

export const INSIGHTS_TABS: SectionTab[] = [
  { href: "/admin/reports", labelKey: "tabs.reports", icon: BarChart3 },
  { href: "/admin/analytics", labelKey: "tabs.performance", icon: Activity },
  { href: "/admin/conversion", labelKey: "tabs.conversion", icon: ArrowRightLeft },
];

export const MEMBER_HOME_TABS: SectionTab[] = [
  { href: "/admin/feed", labelKey: "tabs.posts", icon: Megaphone },
  { href: "/admin/marketing/highlights", labelKey: "tabs.highlights", icon: Sparkles },
];

export const CHECK_IN_TABS: SectionTab[] = [
  { href: "/admin/check-in", labelKey: "tabs.checkIn", icon: ClipboardCheck },
  { href: "/admin/no-shows", labelKey: "tabs.noShows", icon: ShieldAlert },
];

export const TEAM_TABS: SectionTab[] = [
  { href: "/admin/coaches", labelKey: "tabs.coaches", icon: UserCog },
  { href: "/admin/availability", labelKey: "tabs.availability", icon: CalendarOff },
  { href: "/admin/substitutions", labelKey: "tabs.substitutions", icon: ArrowRightLeft },
];

export const FINANCE_TABS: SectionTab[] = [
  { href: "/admin/finance", labelKey: "tabs.cashFlow", icon: Wallet, match: (p) => p === "/admin/finance" },
  { href: "/admin/finance/recognition", labelKey: "tabs.revenueRecognition", icon: TrendingUp },
];

export const ACQUISITION_TABS: SectionTab[] = [
  { href: "/admin/marketing", labelKey: "tabs.linksUtm", icon: Link2, match: (p) => p === "/admin/marketing" },
  { href: "/admin/settings/referrals", labelKey: "tabs.referrals", icon: Users },
];

export const STUDIO_CONFIG_TABS: SectionTab[] = [
  { href: "/admin/branding", labelKey: "tabs.branding", icon: Palette },
  { href: "/admin/settings/policies", labelKey: "tabs.policies", icon: ShieldAlert },
  { href: "/admin/waiver", labelKey: "tabs.waiver", icon: FileSignature },
  { href: "/admin/settings/language", labelKey: "tabs.language", icon: Globe2 },
  { href: "/admin/settings/embed", labelKey: "tabs.embed", icon: Code2 },
  { href: "/admin/platforms", labelKey: "tabs.platforms", icon: Globe2 },
  { href: "/admin/studios", labelKey: "tabs.studios", icon: Building2 },
];
