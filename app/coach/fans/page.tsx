"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users,
  Trophy,
  AlertTriangle,
  Star,
  Heart,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface TopClient {
  user: {
    id: string;
    name: string | null;
    image: string | null;
    email: string;
    memberSince: string;
  };
  classesWithCoach: number;
  totalClasses: number;
  noShows: number;
  lastClass: { date: string; className: string } | null;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function CoachFansPage() {
  const { data: session } = useSession();

  const { data: topClients, isLoading } = useQuery<TopClient[]>({
    queryKey: ["coach-top-clients"],
    queryFn: async () => {
      const res = await fetch("/api/coach/top-clients");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!session?.user?.id,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="flex items-center gap-2.5 font-display text-2xl font-bold sm:text-3xl">
          <Heart className="h-6 w-6 text-coach" />
          Mis Fans
        </h1>
        <p className="mt-1 text-sm text-muted">
          Las alumnas que más asisten a tus clases
        </p>
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : !topClients?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Users className="h-10 w-10 text-muted/30" />
            <p className="font-medium text-muted">Aún no hay datos de alumnas</p>
            <p className="text-sm text-muted/70">
              Cuando tus alumnas reserven clases contigo aparecerán aquí
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
          {topClients.map((client, idx) => {
            const name = client.user.name ?? client.user.email;
            const initials = (client.user.name ?? "U")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2);
            const memberMonths = Math.floor(
              (Date.now() - new Date(client.user.memberSince).getTime()) /
                (1000 * 60 * 60 * 24 * 30),
            );
            const lastDate = client.lastClass
              ? new Date(client.lastClass.date).toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "short",
                })
              : null;

            return (
              <motion.div key={client.user.id} variants={fadeUp}>
                <Card
                  className={cn(
                    "transition-all",
                    idx === 0 && "border-yellow-200 bg-yellow-50/30",
                    idx === 1 && "border-stone-200 bg-stone-50/20",
                    idx === 2 && "border-amber-200 bg-amber-50/15",
                  )}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="relative">
                      <Avatar className="h-11 w-11">
                        {client.user.image && (
                          <AvatarImage src={client.user.image} alt={name} />
                        )}
                        <AvatarFallback className="text-xs font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      {idx < 3 && (
                        <span
                          className={cn(
                            "absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                            idx === 0 && "bg-yellow-400 text-yellow-900",
                            idx === 1 && "bg-stone-300 text-stone-700",
                            idx === 2 && "bg-amber-300 text-amber-800",
                          )}
                        >
                          {idx + 1}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-bold">{name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          {client.classesWithCoach} contigo
                        </span>
                        <span>{client.totalClasses} total</span>
                        {memberMonths > 0 && (
                          <span>
                            {memberMonths >= 12
                              ? `${Math.floor(memberMonths / 12)}a ${memberMonths % 12}m`
                              : `${memberMonths}m`}{" "}
                            miembro
                          </span>
                        )}
                      </div>
                      {client.noShows > 0 && (
                        <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-orange-600">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {client.noShows} cancelación{client.noShows > 1 ? "es" : ""}
                        </span>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      {lastDate && (
                        <p className="text-[10px] text-muted">Última: {lastDate}</p>
                      )}
                      {client.lastClass && (
                        <p className="text-[11px] font-medium text-foreground">
                          {client.lastClass.className}
                        </p>
                      )}
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
