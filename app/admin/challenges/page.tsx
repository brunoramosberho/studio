"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trophy, Plus, Play, Square, Trash2, Flame, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ChallengeEditor,
  emptyDraft,
  type ChallengeDraft,
} from "@/components/admin/challenge-editor";
import { cn } from "@/lib/utils";

interface ChallengeRow {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status: "DRAFT" | "ACTIVE" | "ENDED";
  durationDays: number;
  enrollOpensAt: string;
  enrollClosesAt: string;
  endsAt: string;
  studioIds: string[];
  basePoints: number;
  firstDisciplineBonus: number;
  firstCoachBonus: number;
  photoBonus: number;
  dailyPointsCap: number | null;
  bonusSlots: { dayOfWeek: number; hour: number; points: number }[];
  prizes: { fromRank: number; toRank: number; title: string }[];
  participantCount: number;
}

interface Participant {
  id: string;
  user: { id: string; name: string | null; email: string; image: string | null };
  startsAt: string | null;
  totalPoints: number;
  classesCount: number;
  currentStreak: number;
  longestStreak: number;
  pace: number | null;
}

function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function ChallengesPage() {
  const t = useTranslations("admin.challengesPage");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ChallengeDraft | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{
    challenges: ChallengeRow[];
    studios: { id: string; name: string }[];
  }>({
    queryKey: ["admin-challenges"],
    queryFn: async () => {
      const res = await fetch("/api/admin/challenges");
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const { data: detail } = useQuery<{ participants: Participant[] }>({
    queryKey: ["admin-challenge", openId],
    enabled: !!openId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/challenges/${openId}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const save = useMutation({
    mutationFn: async (draft: ChallengeDraft) => {
      const res = await fetch(
        draft.id ? `/api/admin/challenges/${draft.id}` : "/api/admin/challenges",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-challenges"] });
      setEditing(null);
      setEditorError(null);
      toast.success(t("saved"));
    },
    onError: (err: Error) => setEditorError(err.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "ACTIVE" | "ENDED" }) => {
      const res = await fetch(`/api/admin/challenges/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-challenges"] }),
    onError: (err: Error) =>
      toast.error(
        err.message === "another_challenge_active" ? t("errAnotherActive") : t("errGeneric"),
      ),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/challenges/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-challenges"] }),
  });

  const challenges = data?.challenges ?? [];
  const active = challenges.find((c) => c.status === "ACTIVE");
  const rest = challenges.filter((c) => c.status !== "ACTIVE");

  const toDraft = (c: ChallengeRow): ChallengeDraft => ({
    id: c.id,
    name: c.name,
    description: c.description ?? "",
    imageUrl: c.imageUrl,
    durationDays: c.durationDays,
    enrollOpensAt: c.enrollOpensAt.slice(0, 10),
    enrollClosesAt: c.enrollClosesAt.slice(0, 10),
    studioIds: c.studioIds,
    basePoints: c.basePoints,
    firstDisciplineBonus: c.firstDisciplineBonus,
    firstCoachBonus: c.firstCoachBonus,
    photoBonus: c.photoBonus,
    dailyPointsCap: c.dailyPointsCap,
    bonusSlots: c.bonusSlots ?? [],
    prizes: c.prizes ?? [],
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Trophy className="h-5 w-5 text-admin" />
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <Button
          onClick={() => {
            setEditorError(null);
            setEditing(emptyDraft(isoDay(), isoDay(14)));
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t("new")}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : challenges.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="mx-auto h-8 w-8 text-muted/40" />
            <p className="mt-3 text-sm font-medium">{t("emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">{t("emptyBody")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {active && (
            <ChallengeCard
              challenge={active}
              highlight
              onEdit={() => {
                setEditorError(null);
                setEditing(toDraft(active));
              }}
              onToggleBoard={() => setOpenId(openId === active.id ? null : active.id)}
              boardOpen={openId === active.id}
              participants={openId === active.id ? detail?.participants : undefined}
              onEnd={() => setStatus.mutate({ id: active.id, status: "ENDED" })}
            />
          )}
          {rest.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              onEdit={() => {
                setEditorError(null);
                setEditing(toDraft(c));
              }}
              onToggleBoard={() => setOpenId(openId === c.id ? null : c.id)}
              boardOpen={openId === c.id}
              participants={openId === c.id ? detail?.participants : undefined}
              onPublish={
                c.status === "DRAFT"
                  ? () => setStatus.mutate({ id: c.id, status: "ACTIVE" })
                  : undefined
              }
              onDelete={c.status === "DRAFT" ? () => remove.mutate(c.id) : undefined}
            />
          ))}
        </div>
      )}

      {editing && (
        <ChallengeEditor
          open
          onOpenChange={(o) => !o && setEditing(null)}
          draft={editing}
          studios={data?.studios ?? []}
          locked={
            !!editing.id &&
            challenges.find((c) => c.id === editing.id)?.status !== "DRAFT"
          }
          saving={save.isPending}
          error={editorError}
          onSave={(d) => save.mutate(d)}
        />
      )}
    </div>
  );
}

function ChallengeCard({
  challenge,
  highlight,
  boardOpen,
  participants,
  onEdit,
  onToggleBoard,
  onPublish,
  onEnd,
  onDelete,
}: {
  challenge: ChallengeRow;
  highlight?: boolean;
  boardOpen: boolean;
  participants?: Participant[];
  onEdit: () => void;
  onToggleBoard: () => void;
  onPublish?: () => void;
  onEnd?: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("admin.challengesPage");
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <Card className={cn(highlight && "border-admin/40 bg-admin/[0.03]")}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-semibold">{challenge.name}</h2>
              <Badge
                variant={challenge.status === "ACTIVE" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {t(`status.${challenge.status}`)}
              </Badge>
            </div>
            {challenge.description && (
              <p className="mt-1 text-xs text-muted">{challenge.description}</p>
            )}
            <p className="mt-2 text-xs text-muted">
              {t("cardDates", {
                opens: fmt(challenge.enrollOpensAt),
                closes: fmt(challenge.enrollClosesAt),
                days: challenge.durationDays,
              })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {onPublish && (
              <Button size="sm" onClick={onPublish}>
                <Play className="mr-1 h-3 w-3" />
                {t("publish")}
              </Button>
            )}
            {onEnd && (
              <Button size="sm" variant="outline" onClick={onEnd}>
                <Square className="mr-1 h-3 w-3" />
                {t("end")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onEdit}>
              {t("edit")}
            </Button>
            {onDelete && (
              <Button size="sm" variant="ghost" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <span>{t("pointsSummary", {
            base: challenge.basePoints,
            discipline: challenge.firstDisciplineBonus,
            coach: challenge.firstCoachBonus,
          })}</span>
          {challenge.photoBonus > 0 && (
            <span>{t("photoSummary", { points: challenge.photoBonus })}</span>
          )}
          {challenge.dailyPointsCap != null && (
            <span>{t("capSummary", { cap: challenge.dailyPointsCap })}</span>
          )}
          {challenge.bonusSlots?.length > 0 && (
            <span>{t("slotsSummary", { count: challenge.bonusSlots.length })}</span>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleBoard}
          className="flex items-center gap-1.5 text-xs font-medium text-admin hover:underline"
        >
          <Users className="h-3.5 w-3.5" />
          {t("participants", { count: challenge.participantCount })}
        </button>

        {boardOpen && (
          <div className="rounded-xl border border-border/60">
            {!participants ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : participants.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">{t("noParticipants")}</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {participants.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-5 text-xs tabular-nums text-muted">{i + 1}</span>
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={p.user.image ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {(p.user.name ?? p.user.email).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {p.user.name ?? p.user.email}
                      </p>
                      <p className="text-[11px] text-muted">
                        {p.startsAt
                          ? t("participantMeta", {
                              classes: p.classesCount,
                              pace: p.pace ?? 0,
                            })
                          : t("notStarted")}
                      </p>
                    </div>
                    {p.longestStreak > 1 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-muted">
                        <Flame className="h-3 w-3" />
                        {p.longestStreak}
                      </span>
                    )}
                    <span className="text-sm font-semibold tabular-nums">{p.totalPoints}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
