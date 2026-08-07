"use client";

// Renders the real ChallengeCard against mock data, so every state can be
// reviewed without a member session and without waiting for a real challenge
// to reach it. The disciplines and instructors come from the tenant when there
// are any — see page.tsx for why those are safe to use and the participant
// names are not.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ChallengeCard } from "@/components/challenges/challenge-card";
import type { ActiveChallengeResponse } from "@/components/challenges/types";

const CHALLENGE: ActiveChallengeResponse["challenge"] = {
  id: "c1",
  name: "Summer Challenge",
  description: "30 days to move more and try something new.",
  imageUrl: null,
  durationDays: 30,
  // Stored the way the admin route writes it: 23:59 studio-local, as UTC.
  // Madrid is UTC+2 in August, so the close date really is the 15th.
  enrollOpensAt: "2026-07-31T22:00:00.000Z",
  enrollClosesAt: "2026-08-15T21:59:00.000Z",
  endsAt: "2026-09-14T21:59:00.000Z",
  basePoints: 10,
  firstDisciplineBonus: 15,
  firstCoachBonus: 10,
  photoBonus: 5,
  dailyPointsCap: 25,
  bonusSlots: [{ dayOfWeek: 1, hour: 10, points: 5 }],
  prizes: [
    { fromRank: 1, toRank: 1, title: "A free unlimited month" },
    { fromRank: 2, toRank: 3, title: "A 5-class pack" },
  ],
};

const SCOREBOARD: ActiveChallengeResponse["scoreboard"] = [
  { userId: "u1", name: "Jimena Pérez", image: null, startsAt: "2026-08-01T00:00:00.000Z", totalPoints: 305, classesCount: 24, currentStreak: 4, longestStreak: 6, daysElapsed: 27, pace: 11.3, isMe: false, friendStatus: "ACCEPTED" },
  { userId: "me", name: "Camila Toro", image: null, startsAt: "2026-08-03T00:00:00.000Z", totalPoints: 195, classesCount: 13, currentStreak: 3, longestStreak: 4, daysElapsed: 25, pace: 7.8, isMe: true, friendStatus: null },
  { userId: "u3", name: "Valeria Cuevas", image: null, startsAt: "2026-08-02T00:00:00.000Z", totalPoints: 180, classesCount: 12, currentStreak: 0, longestStreak: 3, daysElapsed: 26, pace: 6.9, isMe: false, friendStatus: null },
  { userId: "u4", name: "Mercedes Ipiña", image: null, startsAt: "2026-08-05T00:00:00.000Z", totalPoints: 150, classesCount: 9, currentStreak: 2, longestStreak: 2, daysElapsed: 23, pace: 6.5, isMe: false, friendStatus: "PENDING" },
  { userId: "u5", name: "Regina Cervantes", image: null, startsAt: "2026-08-26T00:00:00.000Z", totalPoints: 35, classesCount: 1, currentStreak: 1, longestStreak: 1, daysElapsed: 2, pace: null, isMe: false, friendStatus: null },
];

/** The studio's own disciplines and instructors, when it has any. */
export interface PreviewRoster {
  disciplines: { id: string; name: string; color: string }[];
  coaches: { id: string; name: string; photoUrl: string | null }[];
}

const SAMPLE_ROSTER: PreviewRoster = {
  disciplines: [
    { id: "d1", name: "Sculpt", color: "#C9A96E" },
    { id: "d2", name: "Ride", color: "#1F2937" },
    { id: "d3", name: "Barre", color: "#E8D5C4" },
    { id: "d4", name: "Reformer", color: "#7C3AED" },
  ],
  coaches: [
    { id: "c1", name: "Ana", photoUrl: null },
    { id: "c2", name: "Lucía", photoUrl: null },
    { id: "c3", name: "Sofía", photoUrl: null },
    { id: "c4", name: "Mariana", photoUrl: null },
  ],
};

/**
 * Marks the first half of each list as already tried, so the checklist shows
 * both sides of its own state — all-done reads as finished, none-done reads as
 * broken, and the "next up" hint needs something still untried to point at.
 */
function buildProgress(roster: PreviewRoster): ActiveChallengeResponse["progress"] {
  const half = (n: number) => Math.max(1, Math.floor(n / 2));
  const dTried = half(roster.disciplines.length);
  const cTried = half(roster.coaches.length);
  return {
    disciplines: roster.disciplines.map((d, i) => ({ ...d, tried: i < dTried })),
    coaches: roster.coaches.map((c, i) => ({ ...c, tried: i < cTried })),
    photoClassIds: [],
  };
}

const makeBase = (progress: ActiveChallengeResponse["progress"]): Omit<ActiveChallengeResponse, "me"> => ({
  challenge: CHALLENGE,
  enrollmentOpen: true,
  timezone: "Europe/Madrid",
  enrollDaysLeft: 9,
  paceMinDays: 3,
  participantCount: 34,
  progress,
  scoreboard: SCOREBOARD,
});

const NOT_STARTED: ActiveChallengeResponse["me"] = { joinedAt: "2026-08-01T00:00:00.000Z", startsAt: null, endsAt: null, totalPoints: 0, classesCount: 0, currentStreak: 0, longestStreak: 0, daysLeft: null, finished: false };

const makeStates = (BASE: Omit<ActiveChallengeResponse, "me">): { label: string; data: ActiveChallengeResponse }[] => [
  { label: "1 · Not joined yet", data: { ...BASE, me: null, progress: null } },
  {
    label: "1b · Not joined — last day",
    data: { ...BASE, enrollDaysLeft: 0, me: null, progress: null },
  },
  {
    label: "2 · Joined, first class pending",
    data: { ...BASE, progress: null, me: NOT_STARTED },
  },
  {
    label: "2b · Joined — 2 days to book that first class",
    data: { ...BASE, enrollDaysLeft: 2, progress: null, me: NOT_STARTED },
  },
  {
    label: "2c · Joined — deadline passed",
    data: { ...BASE, enrollDaysLeft: -1, progress: null, me: NOT_STARTED },
  },
  {
    label: "3 · Running",
    data: {
      ...BASE,
      me: { joinedAt: "2026-08-01T00:00:00.000Z", startsAt: "2026-08-03T00:00:00.000Z", endsAt: "2026-09-02T00:00:00.000Z", totalPoints: 195, classesCount: 13, currentStreak: 3, longestStreak: 4, daysLeft: 5, finished: false },
    },
  },
  {
    label: "4 · Finished",
    data: {
      ...BASE,
      me: { joinedAt: "2026-08-01T00:00:00.000Z", startsAt: "2026-07-01T00:00:00.000Z", endsAt: "2026-07-31T00:00:00.000Z", totalPoints: 240, classesCount: 16, currentStreak: 0, longestStreak: 5, daysLeft: 0, finished: true },
    },
  },
];

function Seeded({ data }: { data: ActiveChallengeResponse }) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    qc.setQueryData(["challenge-active"], data);
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <ChallengeCard />
    </QueryClientProvider>
  );
}

export default function PreviewClient({ roster }: { roster: PreviewRoster | null }) {
  const states = makeStates(makeBase(buildProgress(roster ?? SAMPLE_ROSTER)));

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      {states.map((s) => (
        <div key={s.label}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {s.label}
          </p>
          <Seeded data={s.data} />
        </div>
      ))}
    </div>
  );
}
