"use client";

// Renders the real ChallengeCard against mock data, so every state can be
// reviewed without a member session and without waiting for a real challenge to
// reach that state. Reachable in development only — see page.tsx.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ChallengeCard } from "@/components/challenges/challenge-card";
import type { ActiveChallengeResponse } from "@/components/challenges/types";

const CHALLENGE: ActiveChallengeResponse["challenge"] = {
  id: "c1",
  name: "Reto de Verano",
  description: "30 días para moverte más y probar algo nuevo.",
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
  dailyPointsCap: 25,
  bonusSlots: [{ dayOfWeek: 1, hour: 10, points: 5 }],
  prizes: [
    { fromRank: 1, toRank: 1, title: "Mes ilimitado gratis" },
    { fromRank: 2, toRank: 3, title: "Paquete de 5 clases" },
  ],
};

const SCOREBOARD: ActiveChallengeResponse["scoreboard"] = [
  { userId: "u1", name: "Jimena Pérez", image: null, startsAt: "2026-08-01T00:00:00.000Z", totalPoints: 305, classesCount: 24, currentStreak: 4, longestStreak: 6, daysElapsed: 27, pace: 11.3, isMe: false, friendStatus: "ACCEPTED" },
  { userId: "me", name: "Camila Toro", image: null, startsAt: "2026-08-03T00:00:00.000Z", totalPoints: 195, classesCount: 13, currentStreak: 3, longestStreak: 4, daysElapsed: 25, pace: 7.8, isMe: true, friendStatus: null },
  { userId: "u3", name: "Valeria Cuevas", image: null, startsAt: "2026-08-02T00:00:00.000Z", totalPoints: 180, classesCount: 12, currentStreak: 0, longestStreak: 3, daysElapsed: 26, pace: 6.9, isMe: false, friendStatus: null },
  { userId: "u4", name: "Mercedes Ipiña", image: null, startsAt: "2026-08-05T00:00:00.000Z", totalPoints: 150, classesCount: 9, currentStreak: 2, longestStreak: 2, daysElapsed: 23, pace: 6.5, isMe: false, friendStatus: "PENDING" },
  { userId: "u5", name: "Regina Cervantes", image: null, startsAt: "2026-08-26T00:00:00.000Z", totalPoints: 35, classesCount: 1, currentStreak: 1, longestStreak: 1, daysElapsed: 2, pace: null, isMe: false, friendStatus: null },
];

const PROGRESS: ActiveChallengeResponse["progress"] = {
  disciplines: [
    { id: "d1", name: "Sculpt", color: "#C9A96E", tried: true },
    { id: "d2", name: "Ride", color: "#1F2937", tried: true },
    { id: "d3", name: "Barre", color: "#E8D5C4", tried: false },
    { id: "d4", name: "Reformer", color: "#7C3AED", tried: false },
  ],
  coaches: [
    { id: "c1", name: "Ana", photoUrl: null, tried: true },
    { id: "c2", name: "Lucía", photoUrl: null, tried: true },
    { id: "c3", name: "Sofía", photoUrl: null, tried: false },
    { id: "c4", name: "Mariana", photoUrl: null, tried: false },
  ],
};

const BASE: Omit<ActiveChallengeResponse, "me"> = {
  challenge: CHALLENGE,
  enrollmentOpen: true,
  timezone: "Europe/Madrid",
  enrollDaysLeft: 9,
  paceMinDays: 3,
  participantCount: 34,
  progress: PROGRESS,
  scoreboard: SCOREBOARD,
};

const NOT_STARTED: ActiveChallengeResponse["me"] = { joinedAt: "2026-08-01T00:00:00.000Z", startsAt: null, endsAt: null, totalPoints: 0, classesCount: 0, currentStreak: 0, longestStreak: 0, daysLeft: null, finished: false };

const STATES: { label: string; data: ActiveChallengeResponse }[] = [
  { label: "1 · Sin inscribirse", data: { ...BASE, me: null, progress: null } },
  {
    label: "1b · Sin inscribirse, último día",
    data: { ...BASE, enrollDaysLeft: 0, me: null, progress: null },
  },
  {
    label: "2 · Inscrito, sin arrancar",
    data: { ...BASE, progress: null, me: NOT_STARTED },
  },
  {
    label: "2b · Inscrito, quedan 2 días para la primera clase",
    data: { ...BASE, enrollDaysLeft: 2, progress: null, me: NOT_STARTED },
  },
  {
    label: "2c · Inscrito, se le pasó la fecha",
    data: { ...BASE, enrollDaysLeft: -1, progress: null, me: NOT_STARTED },
  },
  {
    label: "3 · Corriendo",
    data: {
      ...BASE,
      me: { joinedAt: "2026-08-01T00:00:00.000Z", startsAt: "2026-08-03T00:00:00.000Z", endsAt: "2026-09-02T00:00:00.000Z", totalPoints: 195, classesCount: 13, currentStreak: 3, longestStreak: 4, daysLeft: 5, finished: false },
    },
  },
  {
    label: "4 · Terminado",
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

export default function PreviewClient() {
  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      {STATES.map((s) => (
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
