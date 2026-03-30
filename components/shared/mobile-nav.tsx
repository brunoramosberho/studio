"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Home, CalendarCheck, User, Mic, ShoppingBag, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/components/tenant-provider";

const RESERVAR_BG = "#D85A30";

const leftTabs = [
  { href: "/my", icon: Home, label: "Feed" },
  { href: "/my/bookings", icon: CalendarCheck, label: "Mis clases" },
];

const rightTabsBase = [
  { href: "/shop", icon: ShoppingBag, label: "Shop" },
  { href: "/my/profile", icon: User, label: "Perfil" },
];

const coachTab = { href: "/coach", icon: Mic, label: "Coach" };

const hiddenOnPaths = ["/login", "/admin", "/coach", "/dev", "/directory"];

function tabIsActive(pathname: string, href: string) {
  if (href === "/my") return pathname === "/my";
  return pathname.startsWith(href);
}

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const { role } = useTenant();

  if (!session?.user) return null;
  if (role === "ADMIN") return null;

  const shouldHide = hiddenOnPaths.some(
    (p) => pathname.startsWith(p) && pathname !== "/coaches",
  );
  if (shouldHide) return null;

  const isCoach = role === "COACH";
  const rightTabs = isCoach ? [...rightTabsBase, coachTab] : rightTabsBase;
  const scheduleActive = pathname.startsWith("/schedule");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl safe-bottom md:hidden">
      <div className="flex items-end justify-between gap-1 px-1 pb-1.5 pt-1">
        <div className="flex min-w-0 flex-1 justify-around">
          {leftTabs.map((tab) => {
            const isActive = tabIsActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex min-h-[48px] min-w-[44px] flex-col items-center justify-end gap-0.5 rounded-xl px-2 py-1 text-[10px] font-medium transition-colors",
                  isActive ? "text-accent" : "text-muted",
                )}
              >
                <tab.icon
                  className={cn("h-5 w-5", isActive && "stroke-[2.5]")}
                />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex shrink-0 items-end justify-center px-0.5 pb-0.5">
          <Link
            href="/schedule"
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-[transform,box-shadow,filter]",
              scheduleActive && "ring-2 ring-white/90 ring-offset-2 ring-offset-background",
            )}
            style={{ backgroundColor: RESERVAR_BG }}
          >
            <Plus className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden />
            Reservar
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 justify-around">
          {rightTabs.map((tab) => {
            const isActive = tabIsActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex min-h-[48px] min-w-[44px] flex-col items-center justify-end gap-0.5 rounded-xl px-2 py-1 text-[10px] font-medium transition-colors",
                  isActive
                    ? tab.href === "/coach"
                      ? "text-coach"
                      : "text-accent"
                    : "text-muted",
                )}
              >
                <tab.icon
                  className={cn("h-5 w-5", isActive && "stroke-[2.5]")}
                />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
