"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  Loader2,
  AlertCircle,
  Info,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/shared/page-transition";
import { SpotsBadge } from "@/components/shared/spots-badge";
import {
  formatDate,
  formatTimeRange,
  getLevelLabel,
  cn,
} from "@/lib/utils";
import type { ClassWithDetails } from "@/types";

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [cls, setCls] = useState<ClassWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchClass() {
      try {
        const res = await fetch(`/api/classes/${id}`);
        if (res.ok) {
          setCls(await res.json());
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchClass();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  if (error || !cls) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-2xl px-4 py-32 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted/30" />
          <h1 className="mt-4 font-display text-2xl font-bold text-foreground">
            Clase no encontrada
          </h1>
          <p className="mt-2 text-sm text-muted">
            Esta clase no existe o ya no está disponible.
          </p>
          <Button asChild variant="secondary" className="mt-8">
            <Link href="/schedule">Ver horarios</Link>
          </Button>
        </div>
      </PageTransition>
    );
  }

  const spotsLeft =
    cls.spotsLeft ?? cls.classType.maxCapacity - (cls._count?.bookings ?? 0);

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl px-4 py-8 pb-28 sm:pb-16 sm:py-16">
        <Link
          href="/schedule"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Horarios
        </Link>

        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="level">{getLevelLabel(cls.classType.level)}</Badge>
            <span className="flex items-center gap-1 text-xs text-muted">
              <Clock className="h-3.5 w-3.5" />
              {cls.classType.duration} min
            </span>
          </div>

          <h1 className="mt-4 font-display text-3xl font-bold text-foreground sm:text-4xl">
            {cls.classType.name}
          </h1>

          {cls.classType.description && (
            <p className="mt-3 text-muted leading-relaxed">
              {cls.classType.description}
            </p>
          )}
        </div>

        <Card className="mb-6">
          <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Fecha y hora
                </p>
                <p className="mt-1 font-display text-sm font-bold text-foreground capitalize">
                  {formatDate(cls.startsAt)}
                </p>
                <p className="font-mono text-sm text-accent">
                  {formatTimeRange(cls.startsAt, cls.endsAt)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <User className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Coach
                </p>
                <p className="mt-1 font-display text-sm font-bold text-foreground">
                  {cls.coach.user.name}
                </p>
                {cls.coach.bio && (
                  <p className="mt-1 text-xs leading-relaxed text-muted line-clamp-2">
                    {cls.coach.bio}
                  </p>
                )}
              </div>
            </div>

            {cls.location && (
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted">
                    Ubicación
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {cls.location}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Disponibilidad
                </p>
                <div className="mt-1">
                  <SpotsBadge
                    spotsLeft={spotsLeft}
                    maxCapacity={cls.classType.maxCapacity}
                  />
                </div>
                <p className="mt-0.5 text-[10px] text-muted">
                  {cls.classType.maxCapacity} lugares en total
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {cls.coach.specialties && cls.coach.specialties.length > 0 && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <h3 className="font-display text-sm font-bold text-foreground">
                Sobre {cls.coach.user.name}
              </h3>
              {cls.coach.bio && (
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {cls.coach.bio}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {cls.coach.specialties.map((s) => (
                  <Badge key={s} variant="level">
                    {s}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6 border border-accent/10 bg-accent/5">
          <CardContent className="flex items-start gap-3 p-6">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
            <div>
              <h3 className="font-display text-sm font-bold text-foreground">
                Política de cancelación
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Puedes cancelar tu reserva hasta 12 horas antes del inicio de la
                clase sin perder tu crédito. Cancelaciones tardías o no-shows
                consumen el crédito completo.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Sticky mobile CTA */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-white p-4 safe-bottom sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex-1 sm:hidden">
              <p className="text-xs text-muted">
                {formatTimeRange(cls.startsAt, cls.endsAt)}
              </p>
              <SpotsBadge
                spotsLeft={spotsLeft}
                maxCapacity={cls.classType.maxCapacity}
              />
            </div>
            <Button
              asChild
              size="lg"
              className="flex-shrink-0 sm:w-full"
            >
              <Link href={`/book/${cls.id}`}>
                {spotsLeft > 0 ? "Reservar clase" : "Unirme a lista de espera"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
