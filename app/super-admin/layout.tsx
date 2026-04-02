import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { LayoutDashboard, Building2, Shield } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tenants", label: "Tenants", icon: Building2 },
];

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  });

  if (!user?.isSuperAdmin) redirect("/login");

  return (
    <div className="flex min-h-dvh bg-white">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-gray-800 bg-gray-950 md:flex">
        <div className="flex h-16 items-center gap-3 border-b border-gray-800 px-6">
          <Shield className="h-5 w-5 text-indigo-400" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white">Mgic Studio</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-indigo-400">
              Super Admin
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-gray-800 px-6 py-4">
          <p className="truncate text-xs text-gray-500">{session.user.email}</p>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold">Mgic Studio</span>
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
            Super Admin
          </span>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-200 bg-white md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-gray-500 transition-colors hover:text-gray-900"
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="flex-1 pt-14 md:ml-64 md:pt-0">
        <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 md:pb-8">
          {children}
        </div>
      </main>
    </div>
  );
}
