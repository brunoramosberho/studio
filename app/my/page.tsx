"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, ArrowRight, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/shared/page-transition";
import { formatRelativeDay, formatTimeRange, cn } from "@/lib/utils";
import type { BookingWithDetails, UserPackageWithDetails } from "@/types";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [userPackage, setUserPackage] = useState<UserPackageWithDetails | null>(null);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingPackage, setLoadingPackage] = useState(true);

  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  useEffect(() => {
    async function fetchBookings() {
      try {
        const res = await fetch("/api/bookings?status=upcoming&limit=3");
        if (res.ok) setBookings(await res.json());
      } catch {
        /* silently fail */
      } finally {
        setLoadingBookings(false);
      }
    }

    async function fetchPackage() {
      try {
        const res = await fetch("/api/packages/my");
        if (res.ok) {
          const data = await res.json();
          setUserPackage(data[0] ?? null);
        }
      } catch {
        /* silently fail */
      } finally {
        setLoadingPackage(false);
      }
    }

    fetchBookings();
    fetchPackage();
  }, []);

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Welcome */}
        <div className="hidden md:block">
          <h1 className="font-display text-3xl font-bold text-foreground">
            Hola, {firstName}
          </h1>
          <p className="mt-1 text-muted">
            Aquí tienes un resumen de tu actividad
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/schedule">
              <Calendar className="mr-2 h-4 w-4" />
              Reservar clase
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/schedule">
              Ver horarios
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Upcoming classes */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-foreground">
              Próximas clases
            </h2>
            <Link
              href="/my/bookings"
              className="text-sm font-medium text-accent transition-colors hover:text-accent/80"
            >
              Ver todas
            </Link>
          </div>

          {loadingBookings ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-10 text-center">
                <Calendar className="h-10 w-10 text-muted/30" />
                <p className="mt-3 font-display text-lg font-bold text-foreground">
                  Sin clases próximas
                </p>
                <p className="mt-1 text-sm text-muted">
                  Reserva tu primera clase y comienza tu práctica
                </p>
                <Button asChild className="mt-5" size="sm">
                  <Link href="/schedule">Ver horarios</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <motion.div
              className="space-y-3"
              variants={stagger}
              initial="hidden"
              animate="show"
            >
              {bookings.map((booking) => (
                <motion.div key={booking.id} variants={fadeUp}>
                  <Link href={`/class/${booking.class.id}`}>
                    <Card className="transition-shadow hover:shadow-[var(--shadow-warm-md)]">
                      <CardContent className="flex items-center gap-4 p-4">
                        <div
                          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
                          style={{
                            backgroundColor: `${booking.class.classType.color}15`,
                            color: booking.class.classType.color,
                          }}
                        >
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-sm font-bold text-foreground">
                            {booking.class.classType.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {booking.class.coach.user.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium capitalize text-foreground">
                            {formatRelativeDay(booking.class.startsAt)}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-accent">
                            {formatTimeRange(booking.class.startsAt, booking.class.endsAt)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        {/* Active package */}
        <section>
          <h2 className="mb-4 font-display text-xl font-bold text-foreground">
            Mi paquete
          </h2>

          {loadingPackage ? (
            <Skeleton className="h-40 w-full" />
          ) : userPackage ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="success">Activo</Badge>
                    <CardTitle className="mt-2">
                      {userPackage.package.name}
                    </CardTitle>
                  </div>
                  <Package className="h-5 w-5 text-muted/40" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    {userPackage.creditsTotal === null ? (
                      <p className="font-mono text-2xl font-bold text-accent">
                        Ilimitado
                      </p>
                    ) : (
                      <>
                        <p className="font-mono text-2xl font-bold text-foreground">
                          {userPackage.creditsTotal - userPackage.creditsUsed}
                          <span className="text-base text-muted">
                            /{userPackage.creditsTotal}
                          </span>
                        </p>
                        <p className="text-xs text-muted">créditos restantes</p>
                      </>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">Vence</p>
                    <p className="font-mono text-sm font-medium text-foreground">
                      {new Date(userPackage.expiresAt).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                </div>

                {userPackage.creditsTotal !== null && (
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{
                        width: `${((userPackage.creditsTotal - userPackage.creditsUsed) / userPackage.creditsTotal) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-dashed border-accent/30 bg-accent/5">
              <CardContent className="flex flex-col items-center py-10 text-center">
                <Package className="h-10 w-10 text-accent/40" />
                <p className="mt-3 font-display text-lg font-bold text-foreground">
                  Sin paquete activo
                </p>
                <p className="mt-1 text-sm text-muted">
                  Adquiere un paquete para comenzar a reservar clases
                </p>
                <Button asChild className="mt-5">
                  <Link href="/packages">Comprar paquete</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
