"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Home, Calendar, Search, Bell, User, Package, History, Clock, Trophy } from "lucide-react";
import { MobileNav } from "@/components/shared/mobile-nav";
import { cn } from "@/lib/utils";

const sidebarLinks = [
  { href: "/my", icon: Home, label: "Feed" },
  { href: "/schedule", icon: Calendar, label: "Reservar" },
  { href: "/coaches", icon: Search, label: "Explorar" },
  { href: "/my/bookings", icon: Calendar, label: "Mis Reservas" },
  { href: "/my/packages", icon: Package, label: "Mis Paquetes" },
  { href: "/my/notifications", icon: Bell, label: "Notificaciones" },
  { href: "/my/profile", icon: User, label: "Perfil" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border/50 bg-white md:block">
        <div className="flex h-full flex-col">
          <div className="p-6">
            <Link href="/" className="font-display text-2xl font-bold text-foreground">
              Flō
            </Link>
          </div>

          {session?.user && (
            <div className="mx-4 mb-4 rounded-xl bg-surface p-4">
              <p className="text-xs text-muted">Bienvenida de vuelta</p>
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
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border/50 p-4">
            <p className="text-[10px] text-muted/50">Flō Studio · Portal</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="pb-24 md:ml-64 md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          {/* Mobile header */}
          <div className="mb-6 flex items-center justify-between md:hidden">
            <Link href="/" className="font-display text-xl font-bold text-foreground">
              Flō
            </Link>
            {session?.user && (
              <p className="text-sm text-muted">
                Hola, <span className="font-medium text-foreground">{firstName}</span>
              </p>
            )}
          </div>

          {children}
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
