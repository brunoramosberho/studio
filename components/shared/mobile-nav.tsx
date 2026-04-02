"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Home, CalendarCheck, User, Mic, ShoppingBag, Dumbbell } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTenant } from "@/components/tenant-provider";
import { getIconComponent } from "@/components/admin/icon-picker";

const RESERVA_BG = "#D85A30";
/** Slightly under old h-14; 40% protrudes above nav top, 60% inside */
const RESERVA_BTN_PX = 46;
const RESERVA_PROTRUDE_PX = RESERVA_BTN_PX * 0.4;

const leftTabs = [
  { href: "/my", icon: Home, label: "Home" },
  { href: "/my/bookings", icon: CalendarCheck, label: "Mis clases" },
];

const rightTabsBase = [
  { href: "/shop", icon: ShoppingBag, label: "Shop" },
  { href: "/my/profile", icon: User, label: "Perfil" },
];

const coachTab = { href: "/coach", icon: Mic, label: "Coach" };

const hiddenOnPaths = ["/login", "/admin", "/coach", "/dev", "/directory"];

interface DisciplineIcon {
  id: string;
  icon: string;
  color: string;
}

function useRotatingDisciplineIcon(disciplines: DisciplineIcon[]) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (disciplines.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % disciplines.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [disciplines.length]);

  if (disciplines.length === 0) return { Icon: Dumbbell, color: RESERVA_BG };

  const current = disciplines[index % disciplines.length];
  const Icon = getIconComponent(current.icon);
  return { Icon: Icon || Dumbbell, color: current.color || RESERVA_BG };
}

function tabIsActive(pathname: string, href: string) {
  if (href === "/my") return pathname === "/my";
  return pathname.startsWith(href);
}

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { role } = useTenant();
  const [disciplines, setDisciplines] = useState<DisciplineIcon[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/class-types")
      .then((r) => r.ok ? r.json() : [])
      .then((data: { id: string; icon?: string | null; color: string }[]) => {
        if (cancelled) return;
        const withIcons = data
          .filter((d) => d.icon)
          .map((d) => ({ id: d.id, icon: d.icon!, color: d.color }));
        setDisciplines(withIcons);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const { Icon: ReservaIcon, color: reservaColor } = useRotatingDisciplineIcon(disciplines);

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
    <nav className="fixed bottom-0 left-0 right-0 z-50 overflow-visible border-t border-border/50 bg-background/95 backdrop-blur-xl safe-bottom md:hidden">
      <div className="flex items-end justify-between gap-1 px-1 pb-1.5 pt-3">
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

        <div
          className={cn(
            "flex min-h-[48px] w-[68px] shrink-0 flex-col items-center justify-end gap-0.5 rounded-xl px-2 py-1 text-[10px] font-medium",
            scheduleActive ? "text-accent" : "text-muted",
          )}
        >
          {/* Same slot as tab icons so “Reserva” aligns with other labels */}
          <span className="h-5 w-5 shrink-0" aria-hidden />
          <span>Reserva</span>
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

      <Link
        href="/schedule"
        aria-label="Reserva"
        className={cn(
          "absolute left-1/2 z-[60] flex -translate-x-1/2 items-center justify-center rounded-full text-white shadow-[0_3px_12px_rgba(216,90,48,0.42),0_2px_5px_rgba(0,0,0,0.07)] active:scale-[0.97]",
          "transition-[transform,box-shadow,background-color] duration-700",
          scheduleActive && "ring-[2.5px] ring-white/95 ring-offset-2 ring-offset-background",
        )}
        style={{
          backgroundColor: disciplines.length > 0 ? reservaColor : RESERVA_BG,
          width: RESERVA_BTN_PX,
          height: RESERVA_BTN_PX,
          top: `calc(-1 * ${RESERVA_PROTRUDE_PX}px)`,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={ReservaIcon.displayName || ReservaIcon.name}
            initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="flex items-center justify-center"
          >
            <ReservaIcon
              className="stroke-[2.25]"
              style={{ width: RESERVA_BTN_PX * 0.45, height: RESERVA_BTN_PX * 0.45 }}
              aria-hidden
            />
          </motion.span>
        </AnimatePresence>
      </Link>
    </nav>
  );
}
