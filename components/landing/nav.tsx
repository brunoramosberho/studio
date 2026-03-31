"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "#features", label: "Producto" },
  { href: "#pricing", label: "Precios" },
  { href: "#faq", label: "FAQ" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 15);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-4 top-4 z-50 mx-auto flex max-w-6xl justify-center rounded-lg border border-transparent px-3 py-3 transition duration-300",
        scrolled || open
          ? "border-gray-200/50 bg-white/80 shadow-2xl shadow-black/5 backdrop-blur-sm"
          : "bg-white/0",
      )}
    >
      <div className="w-full md:my-auto">
        <div className="relative flex items-center justify-between">
          <a href="#" className="flex items-center gap-1.5">
            <span className="text-lg font-bold tracking-tight text-gray-900">
              reserva<span className="text-orange-500">.fit</span>
            </span>
          </a>

          <nav className="hidden sm:block md:absolute md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:transform">
            <div className="flex items-center gap-10 font-medium">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="px-2 py-1 text-sm text-gray-900"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </nav>

          <a
            href="#pricing"
            className="hidden h-10 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 sm:inline-flex"
          >
            Empieza gratis
          </a>

          <button
            onClick={() => setOpen(!open)}
            className="rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm sm:hidden"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
          >
            {open ? (
              <X className="size-6 shrink-0 text-gray-900" />
            ) : (
              <Menu className="size-6 shrink-0 text-gray-900" />
            )}
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 flex flex-col gap-6 text-lg ease-in-out will-change-transform sm:hidden"
            >
              <ul className="space-y-4 font-medium">
                {links.map((l) => (
                  <li key={l.href} onClick={() => setOpen(false)}>
                    <a href={l.href}>{l.label}</a>
                  </li>
                ))}
              </ul>
              <a
                href="#pricing"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-center text-lg font-semibold text-gray-900"
              >
                Empieza gratis
              </a>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
