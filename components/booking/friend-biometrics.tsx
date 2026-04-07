"use client";

import { useQuery } from "@tanstack/react-query";
import { Flame, Heart } from "lucide-react";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { maskLastName } from "@/lib/utils";
import Link from "next/link";

interface AttendeeBiometric {
  user: { id: string; name: string | null; image: string | null };
  isMe?: boolean;
  provider: string;
  calories: number | null;
  hrAvg: number | null;
  hrMax: number | null;
}

function StravaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116zm-3.08-8.399l2.086 4.116h3.065L12.304 3.614v.001l-5.154 10.172h3.066l2.091-4.242z" />
    </svg>
  );
}

export function FriendBiometrics({ classId }: { classId: string }) {
  const { data: attendees = [] } = useQuery<AttendeeBiometric[]>({
    queryKey: ["class-biometrics", classId],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${classId}/biometrics`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!classId,
  });

  if (attendees.length === 0) return null;

  const sorted = [...attendees].sort((a, b) => (a.isMe ? -1 : 0) - (b.isMe ? -1 : 0));

  return (
    <div className="space-y-2">
      {sorted.map((f) => (
        <Link
          key={f.user.id}
          href={`/my/user/${f.user.id}`}
          className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white px-3 py-2.5 shadow-sm"
        >
          <UserAvatar
            user={f.user as UserAvatarUser}
            size={28}
            showBadge={false}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {f.isMe ? "Tú" : maskLastName(f.user.name)}
          </span>
          <div className="flex items-center gap-3">
            {f.calories != null && f.calories > 0 && (
              <div className="flex items-center gap-1">
                <Flame className="h-3 w-3 text-orange-500" />
                <span className="text-[12px] font-semibold tabular-nums text-foreground">
                  {Math.round(f.calories)}
                </span>
              </div>
            )}
            {f.hrAvg != null && f.hrAvg > 0 && (
              <div className="flex items-center gap-1">
                <Heart className="h-3 w-3 text-rose-400" />
                <span className="text-[12px] font-semibold tabular-nums text-foreground">
                  {Math.round(f.hrAvg)}
                </span>
              </div>
            )}
            {f.hrMax != null && f.hrMax > 0 && (
              <div className="flex items-center gap-1">
                <Heart className="h-3 w-3 text-rose-600" />
                <span className="text-[12px] font-semibold tabular-nums text-foreground">
                  {Math.round(f.hrMax)}
                </span>
              </div>
            )}
            <StravaIcon className="h-2.5 w-2.5 text-[#FC4C02]" />
          </div>
        </Link>
      ))}
    </div>
  );
}
