"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Clock, Loader2, Calendar, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/shared/page-transition";
import { formatRelativeDay, formatTimeRange } from "@/lib/utils";
import type { ClassWithDetails } from "@/types";

interface WaitlistEntry {
  id: string;
  classId: string;
  userId: string;
  position: number;
  createdAt: string;
  class: ClassWithDetails;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWaitlist() {
      try {
        const res = await fetch("/api/waitlist/my");
        if (res.ok) setEntries(await res.json());
      } catch {
        /* silently fail */
      } finally {
        setLoading(false);
      }
    }
    fetchWaitlist();
  }, []);

  async function handleRemove(entryId: string) {
    setRemovingId(entryId);
    try {
      const res = await fetch(`/api/waitlist/entry/${entryId}`, { method: "DELETE" });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
      }
    } catch {
      /* silently fail */
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Lista de espera
        </h1>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Clock className="h-10 w-10 text-muted/30" />
              <p className="mt-3 font-display text-lg font-bold text-foreground">
                No estás en ninguna lista de espera
              </p>
              <p className="mt-1 text-sm text-muted">
                Cuando una clase esté llena, podrás unirte a la lista de espera
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
            {entries.map((entry) => (
              <motion.div key={entry.id} variants={fadeUp}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div
                        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: `${entry.class.classType.color}15`,
                          color: entry.class.classType.color,
                        }}
                      >
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-display text-sm font-bold text-foreground">
                              {entry.class.classType.name}
                            </p>
                            {entry.class.coach.name && (
                              <p className="mt-0.5 text-xs text-muted">
                                {entry.class.coach.name}
                              </p>
                            )}
                          </div>
                          <Badge>
                            Posición #{entry.position}
                          </Badge>
                        </div>

                        <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                          <span className="flex items-center gap-1 capitalize">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatRelativeDay(entry.class.startsAt)}
                          </span>
                          <span className="flex items-center gap-1 font-mono text-accent">
                            <Clock className="h-3.5 w-3.5" />
                            {formatTimeRange(entry.class.startsAt, entry.class.endsAt)}
                          </span>
                        </div>

                        <div className="mt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleRemove(entry.id)}
                            disabled={removingId === entry.id}
                          >
                            {removingId === entry.id ? (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Salir de la lista
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
