import { prisma } from "@/lib/db";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

export const metadata = {
  title: "reserva.fit — Elige tu estudio",
  description: "Encuentra tu estudio de fitness y reserva tu próxima clase.",
};

export default async function DirectoryPage() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: {
      slug: true,
      name: true,
      tagline: true,
      logoUrl: true,
      colorAccent: true,
    },
    orderBy: { name: "asc" },
  });

  const isSecure = process.env.NODE_ENV === "production";
  const protocol = isSecure ? "https" : "http";

  function tenantUrl(slug: string) {
    return `${protocol}://${slug}.${ROOT_DOMAIN}`;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-6">
          <span className="text-lg font-semibold tracking-tight text-gray-900">
            reserva<span className="text-indigo-500">.fit</span>
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-5xl px-6 pt-16 pb-12 text-center sm:pt-24 sm:pb-16">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Elige tu estudio
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-lg text-gray-500">
          Reserva clases, compra paquetes y lleva el control de tu práctica.
        </p>
      </section>

      {/* Grid */}
      <section className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24">
        {tenants.length === 0 ? (
          <p className="text-center text-gray-400">
            No hay estudios disponibles aún.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tenants.map((t) => (
              <a
                key={t.slug}
                href={tenantUrl(t.slug)}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                {/* Accent bar */}
                <div
                  className="h-1.5"
                  style={{ backgroundColor: t.colorAccent }}
                />
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center gap-3">
                    {t.logoUrl ? (
                      <img
                        src={t.logoUrl}
                        alt={t.name}
                        className="h-10 w-10 rounded-xl object-contain"
                      />
                    ) : (
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-white"
                        style={{ backgroundColor: t.colorAccent }}
                      >
                        {t.name[0]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-lg font-semibold text-gray-900">
                        {t.name}
                      </h2>
                      {t.tagline && (
                        <p className="truncate text-sm text-gray-500">
                          {t.tagline}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-sm font-medium text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100">
                    Ir al estudio
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        reserva.fit — La plataforma para tu estudio.
      </footer>
    </div>
  );
}
