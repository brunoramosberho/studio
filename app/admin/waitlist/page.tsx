"use client";

import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ListOrdered,
  ArrowUpRight,
  Users,
  Clock,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatTime, formatDate, timeAgo } from "@/lib/utils";

interface WaitlistClass {
  classId: string;
  className: string;
  classDate: string;
  startsAt: string;
  capacity: number;
  enrolled: number;
  waitlist: {
    id: string;
    position: number;
    userName: string;
    userEmail: string;
    createdAt: string;
  }[];
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function AdminWaitlistPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();

  const { data: waitlistClasses, isLoading } = useQuery<WaitlistClass[]>({
    queryKey: ["admin-waitlist"],
    queryFn: async () => {
      const res = await fetch("/api/admin/waitlist");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async ({ waitlistId, classId }: { waitlistId: string; classId: string }) => {
      const res = await fetch(`/api/waitlist/${classId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waitlistId }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-waitlist"] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("waitlistTitle")}</h1>
        <p className="mt-1 text-muted">{t("waitlistSubtitle")}</p>
      </motion.div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : !waitlistClasses?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ListOrdered className="h-10 w-10 text-muted/30" />
            <p className="font-medium text-muted">{t("noActiveWaitlist")}</p>
            <p className="text-sm text-muted/70">
              {t("waitlistAppearsWhen")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
          {waitlistClasses.map((cls) => (
            <motion.div key={cls.classId} variants={fadeUp}>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{cls.className}</CardTitle>
                      <p className="mt-1 text-sm text-muted">
                        {formatDate(cls.classDate)} · {formatTime(cls.startsAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="danger">
                        <Users className="mr-1 h-3 w-3" />
                        {cls.enrolled}/{cls.capacity}
                      </Badge>
                      <Badge variant="warning">
                        {cls.waitlist.length} {t("inWaitlist")}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {cls.waitlist.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 rounded-xl bg-surface p-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-admin/10 font-mono text-sm font-bold text-admin">
                        {entry.position}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{entry.userName}</p>
                        <p className="truncate text-xs text-muted">{entry.userEmail}</p>
                      </div>
                      <span className="hidden text-xs text-muted sm:block">
                        {timeAgo(entry.createdAt)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-admin"
                        onClick={() =>
                          promoteMutation.mutate({
                            waitlistId: entry.id,
                            classId: cls.classId,
                          })
                        }
                        disabled={promoteMutation.isPending}
                      >
                        {promoteMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        )}
                        {t("promoteToBooking")}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
