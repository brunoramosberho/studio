import { useQuery } from "@tanstack/react-query";

export interface CoachMe {
  id: string;
  userId: string | null;
  name: string;
  photoUrl: string | null;
  color: string;
  specialties?: string[];
}

/**
 * The current coach's identity, resolved from the auth cookie server-side via
 * /api/coach/me. Use this instead of useSession() inside the coach portal:
 * next-auth's shared module singleton can leave useSession() stale after a
 * client↔coach portal switch, which would leave coach-scoped queries disabled
 * (empty schedule, etc.). All coach pages share the same ["coach-me"] cache.
 */
export function useCoachMe() {
  return useQuery<{ coach: CoachMe }>({
    queryKey: ["coach-me"],
    queryFn: async () => {
      const res = await fetch("/api/coach/me");
      if (!res.ok) throw { status: res.status };
      return res.json();
    },
    retry: 1,
    staleTime: 30 * 1000,
    refetchOnMount: true,
  });
}
