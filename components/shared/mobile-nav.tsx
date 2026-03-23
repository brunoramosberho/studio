"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Search, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/my", icon: Home, label: "Feed" },
  { href: "/schedule", icon: Calendar, label: "Reservar" },
  { href: "/coaches", icon: Search, label: "Explorar" },
  { href: "/my/notifications", icon: Bell, label: "Avisos" },
  { href: "/my/profile", icon: User, label: "Perfil" },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl safe-bottom md:hidden">
      <div className="flex items-center justify-around px-1 py-1">
        {tabs.map((tab) => {
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
    </nav>
  );
}
