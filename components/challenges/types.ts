export interface ChallengePrize {
  fromRank: number;
  toRank: number;
  title: string;
}

export interface ScoreboardRow {
  userId: string;
  name: string | null;
  image: string | null;
  startsAt: string | null;
  totalPoints: number;
  classesCount: number;
  currentStreak: number;
  longestStreak: number;
  daysElapsed: number;
  /** Null until the member passes the minimum days to be ranked fairly. */
  pace: number | null;
  isMe: boolean;
  friendStatus: "ACCEPTED" | "PENDING" | "DECLINED" | null;
}

export interface ActiveChallengeResponse {
  challenge: {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    durationDays: number;
    enrollOpensAt: string;
    enrollClosesAt: string;
    endsAt: string;
    basePoints: number;
    firstDisciplineBonus: number;
    firstCoachBonus: number;
    photoBonus: number;
    dailyPointsCap: number | null;
    bonusSlots: { dayOfWeek: number; hour: number; points: number }[];
    prizes: ChallengePrize[];
  };
  enrollmentOpen: boolean;
  /** IANA zone of the studio — the deadline must be read in it, not the browser's. */
  timezone: string;
  /** Calendar days until enrolment closes: 0 = last day, negative = passed. */
  enrollDaysLeft: number;
  paceMinDays: number;
  participantCount: number;
  me: {
    joinedAt: string;
    startsAt: string | null;
    endsAt: string | null;
    totalPoints: number;
    classesCount: number;
    currentStreak: number;
    longestStreak: number;
    daysLeft: number | null;
    finished: boolean;
  } | null;
  progress: {
    disciplines: { id: string; name: string; color: string; tried: boolean }[];
    coaches: { id: string; name: string; photoUrl: string | null; tried: boolean }[];
    /** Classes whose photo bonus is already banked. */
    photoClassIds: string[];
  } | null;
  scoreboard: ScoreboardRow[];
}
