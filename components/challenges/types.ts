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
    dailyPointsCap: number | null;
    bonusSlots: { dayOfWeek: number; hour: number; points: number }[];
    prizes: ChallengePrize[];
  };
  enrollmentOpen: boolean;
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
  } | null;
  scoreboard: ScoreboardRow[];
}
