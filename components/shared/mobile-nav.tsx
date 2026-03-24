"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Home, Dumbbell, CalendarCheck, User, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/my", icon: Home, label: "Feed" },
  { href: "/schedule", icon: Dumbbell, label: "Clases" },
  { href: "/my/bookings", icon: CalendarCheck, label: "Reservas" },
  { href: "/my/profile", icon: User, label: "Perfil" },
];

const hiddenOnPaths = ["/login", "/admin", "/coach", "/dev"];

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (!session?.user) return null;

  const role = (session.user as Record<string, unknown>).role;
  if (role === "ADMIN") return null;

  const shouldHide = hiddenOnPaths.some(
    (p) => pathname.startsWith(p) && pathname !== "/coaches",
  );
  if (shouldHide) return null;

  const isCoach = role === "COACH";
  const allTabs = isCoach
    ? [...tabs, { href: "/coach", icon: Mic, label: "Coach" }]
    : tabs;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl safe-bottom md:hidden">
      <div className="flex items-center justify-around px-1 py-1">
        {allTabs.map((tab) => {
          const isActive =
            tab.href === "/my"
              ? pathname === "/my"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex min-h-[48px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors",
                isActive
                  ? tab.href === "/coach" ? "text-coach" : "text-accent"
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
    </nav>
  );
}
