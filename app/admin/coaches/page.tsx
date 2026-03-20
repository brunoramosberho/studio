"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { UserCog, CalendarDays, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { CoachProfileWithUser } from "@/types";

interface CoachWithStats extends CoachProfileWithUser {
  _count?: { classes: number };
  classesThisMonth?: number;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function AdminCoachesPage() {
  const { data: coaches, isLoading } = useQuery<CoachWithStats[]>({
    queryKey: ["admin-coaches"],
    queryFn: async () => {
      const res = await fetch("/api/coaches");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Coaches</h1>
          <p className="mt-1 text-muted">Administra el equipo de coaches</p>
        </motion.div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : !coaches?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <UserCog className="h-10 w-10 text-muted/30" />
            <p className="font-medium text-muted">No hay coaches registrados</p>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {coaches.map((coach) => {
            const name = coach.user.name ?? "Coach";
            const initials = name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2);
            const classCount =
              coach.classesThisMonth ?? coach._count?.classes ?? 0;

            return (
              <motion.div key={coach.id} variants={fadeUp}>
                <Card className="transition-shadow hover:shadow-warm-md">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12 ring-2 ring-admin/10">
                        {coach.user.image && (
                          <AvatarImage src={coach.user.image} alt={name} />
                        )}
                        <AvatarFallback className="bg-admin/10 text-sm text-admin">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-display text-base font-bold">
                          {name}
                        </h3>
                        <p className="truncate text-sm text-muted">
                          {coach.user.email}
                        </p>
                      </div>
                    </div>

                    {coach.specialties && coach.specialties.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {coach.specialties.slice(0, 3).map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                        {coach.specialties.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{coach.specialties.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm text-muted">
                        <CalendarDays className="h-4 w-4" />
                        <span className="font-mono">{classCount}</span>
                        <span>clases este mes</span>
                      </div>
                      <Button variant="ghost" size="sm" className="gap-1 text-admin">
                        <Plus className="h-3.5 w-3.5" />
                        Asignar clase
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
