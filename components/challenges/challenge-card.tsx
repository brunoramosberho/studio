"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  Trophy,
  Flame,
  ChevronRight,
  Loader2,
  Sparkles,
  Clock,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChallengeScoreboard } from "./challenge-scoreboard";
import type { ActiveChallengeResponse } from "./types";

/**
 * The challenge card at the top of the member feed.
 *
 * It answers one question at a time, because the member only ever has one:
 * before joining — "what is this and what do I get"; after joining but before
 * their first class — "when does it start"; while running — "where do I stand
 * and what's left"; once finished — "how did I do".
 */
export function ChallengeCard() {
  const t = useTranslations("member.challenge");
  const locale = useLocale();
  const qc = useQueryClient();
  const [boardOpen, setBoardOpen] = useState(false);

  const { data, isLoading } = useQuery<ActiveChallengeResponse>({
    queryKey: ["challenge-active"],
    queryFn: async () => {
      const res = await fetch("/api/challenges/active");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const join = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/challenges/${id}/join`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["challenge-active"] }),
  });

  if (isLoading) return <Skeleton className="h-28 w-full rounded-2xl" />;
  if (!data?.challenge) return null;

  const { challenge, me, enrollmentOpen, participantCount, progress } = data;
  // Someone who never joined and can no longer join has nothing to act on.
  if (!me && !enrollmentOpen) return null;

  // Read in the studio's zone, so the day shown is the day the studio means.
  const deadline = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-ES", {
    day: "numeric",
    month: "short",
    timeZone: data.timezone,
  }).format(new Date(challenge.enrollClosesAt));
  const daysToDeadline = data.enrollDaysLeft;
  const deadlinePassed = daysToDeadline < 0;

  const topPrize = [...(challenge.prizes ?? [])].sort((a, b) => a.fromRank - b.fromRank)[0];
  const myRank = me?.startsAt
    ? data.scoreboard
        .filter((r) => r.pace != null)
        .sort((a, b) => (b.pace ?? 0) - (a.pace ?? 0))
        .findIndex((r) => r.isMe) + 1
    : 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card"
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            {challenge.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={challenge.imageUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <Trophy className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                {t("eyebrow")}
              </p>
              <h3 className="truncate text-base font-semibold">{challenge.name}</h3>
            </div>
          </div>

          {/* ── Not joined yet ─────────────────────────────────────────── */}
          {!me && (
            <div className="mt-3 space-y-3">
              {challenge.description && (
                <p className="text-sm text-muted">{challenge.description}</p>
              )}
              <ul className="space-y-1.5 text-sm">
                <Rule>{t("ruleBase", { points: challenge.basePoints })}</Rule>
                {challenge.firstDisciplineBonus > 0 && (
                  <Rule>{t("ruleDiscipline", { points: challenge.firstDisciplineBonus })}</Rule>
                )}
                {challenge.firstCoachBonus > 0 && (
                  <Rule>{t("ruleCoach", { points: challenge.firstCoachBonus })}</Rule>
                )}
                <Rule>{t("ruleWindow", { days: challenge.durationDays })}</Rule>
              </ul>
              {topPrize && (
                <p className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {t("prizeLine", { prize: topPrize.title })}
                </p>
              )}
              <Deadline days={daysToDeadline}>
                {t("deadlineJoin", { date: deadline })}
              </Deadline>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => join.mutate(challenge.id)}
                  disabled={join.isPending}
                  className="flex-1"
                >
                  {join.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("join")}
                </Button>
                {participantCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setBoardOpen(true)}
                    className="text-xs text-muted underline-offset-2 hover:underline"
                  >
                    {t("whoIsIn", { count: participantCount })}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Joined, first class still pending ──────────────────────── */}
          {me && !me.startsAt && (
            <div className="mt-3 space-y-3">
              {/* The deadline to take that first class is the same date as the
                  one to join, and missing it forfeits the challenge silently.
                  It is the single most important thing on this card. */}
              {deadlinePassed ? (
                <p className="text-sm text-muted">{t("deadlineMissed")}</p>
              ) : (
                <>
                  <p className="text-sm text-muted">
                    {t("notStartedBody", { days: challenge.durationDays })}
                  </p>
                  <Deadline days={daysToDeadline}>
                    {t("deadlineActivate", { date: deadline })}
                  </Deadline>
                  <Button asChild className="w-full">
                    <Link href="/schedule">{t("bookFirst")}</Link>
                  </Button>
                </>
              )}
            </div>
          )}

          {/* ── Running ────────────────────────────────────────────────── */}
          {me && me.startsAt && !me.finished && (
            <div className="mt-3 space-y-3">
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-3xl font-bold leading-none tabular-nums">
                    {me.totalPoints}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">
                    {t("points")}
                  </p>
                </div>
                {myRank > 0 && (
                  <div className="pb-0.5">
                    <p className="text-lg font-semibold leading-none tabular-nums">
                      #{myRank}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">
                      {t("rank")}
                    </p>
                  </div>
                )}
                {me.currentStreak > 1 && (
                  <div className="pb-0.5">
                    <p className="flex items-center gap-1 text-lg font-semibold leading-none tabular-nums">
                      <Flame className="h-4 w-4 text-orange-500" />
                      {me.currentStreak}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">
                      {t("streak")}
                    </p>
                  </div>
                )}
              </div>

              {me.daysLeft != null && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Clock className="h-3.5 w-3.5" />
                  {t("daysLeft", { days: me.daysLeft })}
                </p>
              )}

              {progress && <NextUp progress={progress} challenge={challenge} />}

              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="flex w-full items-center justify-between rounded-xl bg-muted/10 px-3 py-2.5 text-sm font-medium transition hover:bg-muted/20"
              >
                {t("openBoard")}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ── Finished ───────────────────────────────────────────────── */}
          {me && me.finished && (
            <div className="mt-3 space-y-3">
              <p className="text-sm">
                {t("finishedBody", {
                  points: me.totalPoints,
                  classes: me.classesCount,
                })}
              </p>
              {me.longestStreak > 1 && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Flame className="h-3.5 w-3.5 text-orange-500" />
                  {t("finishedStreak", { days: me.longestStreak })}
                </p>
              )}
              <button
                type="button"
                onClick={() => setBoardOpen(true)}
                className="flex w-full items-center justify-between rounded-xl bg-muted/10 px-3 py-2.5 text-sm font-medium transition hover:bg-muted/20"
              >
                {t("openFinalBoard")}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </motion.div>

      <ChallengeScoreboard open={boardOpen} onOpenChange={setBoardOpen} data={data} />
    </>
  );
}

/** Days out at which the deadline stops being a detail and becomes the point. */
const DEADLINE_URGENT_DAYS = 3;

/**
 * The date is always shown; the countdown and the warning tone only appear once
 * it's close, when "15 ago" starts needing mental arithmetic the member
 * shouldn't have to do.
 *
 * Proximity alone sets the tone, for both the member who hasn't joined and the
 * one who has. They stand to lose different things — a place in the challenge
 * versus one they already claimed — but on the last day both need to act today.
 */
function Deadline({ days, children }: { days: number; children: React.ReactNode }) {
  const t = useTranslations("member.challenge");
  const close = days <= DEADLINE_URGENT_DAYS;

  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs",
        close
          ? "border border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
          : "bg-muted/10 text-muted",
      )}
    >
      <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {children}
        {close && <strong className="ml-1 font-semibold">{t("deadlineSoon", { days })}</strong>}
      </span>
    </p>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-muted">
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
      <span>{children}</span>
    </li>
  );
}

/**
 * The single most valuable thing they could book next. Showing one concrete
 * suggestion beats a wall of checkboxes — the full checklist lives in the
 * scoreboard sheet for whoever wants it.
 */
function NextUp({
  progress,
  challenge,
}: {
  progress: NonNullable<ActiveChallengeResponse["progress"]>;
  challenge: ActiveChallengeResponse["challenge"];
}) {
  const t = useTranslations("member.challenge");
  const discipline = progress.disciplines.find((d) => !d.tried);
  const coach = progress.coaches.find((c) => !c.tried);

  if (discipline && challenge.firstDisciplineBonus > 0) {
    return (
      <p className="rounded-xl border border-dashed border-primary/30 px-3 py-2 text-xs">
        {t("nextDiscipline", {
          name: discipline.name,
          points: challenge.firstDisciplineBonus,
        })}
      </p>
    );
  }
  if (coach && challenge.firstCoachBonus > 0) {
    return (
      <p className="rounded-xl border border-dashed border-primary/30 px-3 py-2 text-xs">
        {t("nextCoach", { name: coach.name, points: challenge.firstCoachBonus })}
      </p>
    );
  }
  return (
    <p className={cn("rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium")}>
      {t("allTried")}
    </p>
  );
}
