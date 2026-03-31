"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useBranding } from "@/components/branding-provider";

const footerLinks = {
  studio: [
    { href: "/schedule", label: "Horarios" },
    { href: "/coaches", label: "Coaches" },
    { href: "/packages", label: "Paquetes" },
  ],
  account: [
    { href: "/login", label: "Iniciar sesión" },
    { href: "/my", label: "Mi cuenta" },
    { href: "/my/bookings", label: "Mis reservas" },
  ],
};

export function Footer() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { studioName, slogan, logoUrl } = useBranding();

  const hideForLoggedIn =
    pathname === "/schedule" ||
    pathname === "/coaches" ||
    pathname.startsWith("/my") ||
    pathname.startsWith("/class/") ||
    pathname.startsWith("/book/");
  if (session?.user && hideForLoggedIn) return null;

  return (
    <footer className="border-t border-border/50 bg-surface/50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-block">
              {logoUrl ? (
                <img src={logoUrl} alt={studioName} className="h-7 max-w-[160px] object-contain" />
              ) : (
                <span className="font-display text-3xl font-bold text-foreground">{studioName}</span>
              )}
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted">
              {slogan}
            </p>
            <div className="mt-4 flex gap-4">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition-colors hover:text-accent"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground">
              Studio
            </h3>
            <ul className="space-y-2">
              {footerLinks.studio.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted transition-colors hover:text-accent">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground">
              Cuenta
            </h3>
            <ul className="space-y-2">
              {footerLinks.account.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted transition-colors hover:text-accent">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <p className="text-center text-xs text-muted">
            {studioName} Studio © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  );
}
