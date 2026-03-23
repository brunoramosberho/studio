"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Calendar, BookOpen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { generateCalendarUrl } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";

interface ConfirmationScreenProps {
  classTitle?: string;
  classDate?: string;
  classTime?: string;
  coachName?: string;
  startsAt?: string;
  endsAt?: string;
  location?: string;
}

const ACCENT = "#C9A96E";

function useConfettiParticles(count: number = 24) {
  return useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        angle: Math.random() * Math.PI * 2,
        distance: 60 + Math.random() * 100,
        size: 4 + Math.random() * 4,
        delay: Math.random() * 0.3,
        opacity: 0.4 + Math.random() * 0.6,
      })),
    [count],
  );
}

export function ConfirmationScreen({
  classTitle,
  classDate,
  classTime,
  coachName,
  startsAt,
  endsAt,
  location,
}: ConfirmationScreenProps) {
  const particles = useConfettiParticles();
  const { studioName } = useBranding();

  const calendarUrl =
    startsAt && endsAt
      ? generateCalendarUrl(
          `${studioName} Studio – ${classTitle ?? "Clase"}`,
          new Date(startsAt),
          new Date(endsAt),
          location,
          `Clase con ${coachName ?? "tu coach"} en ${studioName} Studio`,
        )
      : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center px-4 py-8 text-center"
    >
      {/* Animated checkmark with confetti */}
      <div className="relative mb-8">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: ACCENT,
              left: "50%",
              top: "50%",
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{
              x: Math.cos(p.angle) * p.distance,
              y: Math.sin(p.angle) * p.distance,
              opacity: [0, p.opacity, 0],
              scale: [0, 1, 0.5],
            }}
            transition={{
              duration: 1.2,
              delay: 0.4 + p.delay,
              ease: "easeOut" as const,
            }}
          />
        ))}

        <motion.div
          className="flex h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: `${ACCENT}15` }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 15,
            mass: 0.8,
          }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 12,
              delay: 0.2,
            }}
          >
            <Check className="h-10 w-10" style={{ color: ACCENT }} strokeWidth={3} />
          </motion.div>
        </motion.div>
      </div>

      {/* Title */}
      <motion.h2
        className="font-display text-2xl font-bold text-foreground"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        ¡Reserva confirmada!
      </motion.h2>

      <motion.p
        className="mt-2 text-sm text-muted"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        Tu lugar está asegurado
      </motion.p>

      {/* Class details card */}
      {classTitle && (
        <motion.div
          className="mt-6 w-full max-w-sm"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <h3 className="font-display text-lg font-bold text-foreground">
                {classTitle}
              </h3>
              <div className="mt-3 space-y-1.5 text-sm text-muted">
                {classDate && <p className="capitalize">{classDate}</p>}
                {classTime && (
                  <p className="font-mono" style={{ color: ACCENT }}>
                    {classTime}
                  </p>
                )}
                {coachName && <p>con {coachName}</p>}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Action buttons */}
      <motion.div
        className="mt-8 flex w-full max-w-sm flex-col gap-3"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        {calendarUrl && (
          <Button asChild variant="secondary" size="lg" className="w-full">
            <a href={calendarUrl} target="_blank" rel="noopener noreferrer">
              <Calendar className="mr-2 h-4 w-4" />
              Agregar al calendario
            </a>
          </Button>
        )}

        <Button asChild size="lg" className="w-full">
          <Link href="/my/bookings">
            <BookOpen className="mr-2 h-4 w-4" />
            Ver mis reservas
          </Link>
        </Button>

        <Button asChild variant="ghost" size="lg" className="w-full">
          <Link href="/schedule">
            Reservar otra clase
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </motion.div>
    </motion.div>
  );
}
