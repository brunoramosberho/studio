"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

type BirthdayState = "upcoming" | "today" | "passed";

/**
 * Works out whether the member's birthday falls in the CURRENT Monday–Sunday
 * week, and whether it's upcoming, today, or already passed within that week.
 * Uses the device's local date (the member's own "today") and compares against
 * the actual dates of the week, so it handles the year boundary naturally.
 */
function getBirthdayState(birthday: string): BirthdayState | null {
  const [, mStr, dStr] = birthday.slice(0, 10).split("-");
  const bMonth = Number(mStr);
  const bDay = Number(dStr);
  if (!bMonth || !bDay) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (today.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (d.getMonth() + 1 === bMonth && d.getDate() === bDay) {
      const diff = d.getTime() - today.getTime();
      if (diff === 0) return "today";
      return diff < 0 ? "passed" : "upcoming";
    }
  }
  return null;
}

/** A few emoji bursting outward once, on the actual birthday. */
function ConfettiBurst() {
  const pieces = [
    { x: -46, y: -16, e: "🎉", delay: 0 },
    { x: 46, y: -20, e: "✨", delay: 0.05 },
    { x: -22, y: -28, e: "🎈", delay: 0.1 },
    { x: 24, y: -30, e: "🎉", delay: 0.12 },
    { x: 0, y: -34, e: "✨", delay: 0.18 },
    { x: 62, y: -8, e: "🎊", delay: 0.08 },
    { x: -62, y: -6, e: "🎊", delay: 0.14 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute left-9 top-1/2 text-sm"
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
          animate={{
            opacity: [0, 1, 1, 0],
            x: p.x,
            y: p.y,
            scale: 1,
            rotate: p.x > 0 ? 35 : -35,
          }}
          transition={{ duration: 1.6, delay: p.delay, ease: "easeOut" }}
        >
          {p.e}
        </motion.span>
      ))}
    </div>
  );
}

export function BirthdayGreeting({
  birthday,
  name,
  studioName,
}: {
  birthday: string | null | undefined;
  name: string;
  studioName: string;
}) {
  const t = useTranslations("member");
  const state = useMemo(
    () => (birthday ? getBirthdayState(birthday) : null),
    [birthday],
  );

  if (!state) return null;

  const title =
    state === "today"
      ? t("birthdayTodayTitle", { name })
      : state === "upcoming"
        ? t("birthdayUpcomingTitle", { name })
        : t("birthdayPassedTitle", { name });

  const subtitle =
    state === "today" ? t("birthdayTodaySignature", { studio: studioName }) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-pink-200/70 bg-gradient-to-r from-pink-50 via-rose-50 to-amber-50 px-4 py-3 dark:border-pink-500/25 dark:from-pink-500/10 dark:via-rose-500/10 dark:to-amber-500/10"
    >
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-lg shadow-sm dark:bg-white/10">
          🎂
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-pink-900 dark:text-pink-100">
            {title}
          </p>
          {subtitle && (
            <p className="truncate text-xs text-pink-700/80 dark:text-pink-200/70">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {state === "today" && <ConfettiBurst />}
    </motion.div>
  );
}
