"use client";

import { motion } from "framer-motion";
import { Clock, Users } from "lucide-react";
import { cn, formatTime, getLevelLabel, isClassPast } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SpotsBadge } from "@/components/shared/spots-badge";
import type { ClassWithDetails } from "@/types";

interface ClassCardProps {
  classData: ClassWithDetails;
  maxCapacity: number;
  onClick?: () => void;
  className?: string;
}

export function ClassCard({
  classData,
  maxCapacity,
  onClick,
  className,
}: ClassCardProps) {
  const past = isClassPast(classData.endsAt);
  const spotsLeft =
    classData.spotsLeft ?? maxCapacity - classData.bookings.length;
  const durationMin = Math.round(
    (new Date(classData.endsAt).getTime() -
      new Date(classData.startsAt).getTime()) /
      60_000,
  );
  const coachName = classData.coach.user.name ?? "Coach";
  const coachInitials = coachName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={past ? undefined : { scale: 1.02 }}
      whileTap={past ? undefined : { scale: 0.98 }}
      className={cn(
        "group relative w-full cursor-pointer rounded-2xl bg-white p-4 text-left shadow-[var(--shadow-warm)] transition-shadow duration-200",
        "min-h-[48px] touch-manipulation",
        !past && "hover:shadow-[var(--shadow-warm-lift)]",
        past && "pointer-events-auto cursor-default opacity-50 grayscale",
        className,
      )}
      disabled={past}
    >
      <div className="flex items-start gap-4">
        {/* Time column */}
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          <span className="font-mono text-sm font-semibold text-foreground">
            {formatTime(classData.startsAt)}
          </span>
          <span className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted">
            <Clock className="h-3 w-3" />
            {durationMin}m
          </span>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display text-base font-bold leading-snug text-foreground">
              {classData.classType.name}
            </h3>
            <Badge variant="level" className="shrink-0">
              {getLevelLabel(classData.classType.level)}
            </Badge>
          </div>

          {/* Coach */}
          <div className="mt-2 flex items-center gap-2">
            <Avatar className="h-6 w-6">
              {(classData.coach.photoUrl || classData.coach.user.image) && (
                <AvatarImage
                  src={(classData.coach.photoUrl || classData.coach.user.image)!}
                  alt={coachName}
                />
              )}
              <AvatarFallback className="text-[10px]">
                {coachInitials}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm text-muted">{coachName}</span>
          </div>

          {/* Bottom row */}
          <div className="mt-2.5 flex items-center gap-3">
            <SpotsBadge spotsLeft={spotsLeft} maxCapacity={maxCapacity} />
            <span className="flex items-center gap-1 text-xs text-muted/70">
              <Users className="h-3 w-3" />
              {maxCapacity - spotsLeft}/{maxCapacity}
            </span>
          </div>
        </div>
      </div>

      {/* Color accent strip */}
      {classData.classType.color && (
        <div
          className="absolute left-0 top-3 h-8 w-1 rounded-r-full"
          style={{ backgroundColor: classData.classType.color }}
        />
      )}
    </motion.button>
  );
}
