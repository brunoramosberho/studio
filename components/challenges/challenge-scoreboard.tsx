"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Flame, UserPlus, Check, Sparkles, X, Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readableTextColor } from "@/lib/color";
import type { ActiveChallengeResponse, ScoreboardRow } from "./types";

type SortKey = "pace" | "points";

/**
 * The full scoreboard, as a bottom sheet.
 *
 * Ranking defaults to PACE, not total points: every participant starts their
 * own window on their first class, so on any given day the totals compare
 * people who are 3 days in against people who are 25 days in. Points are one
 * tap away for anyone who wants the raw number.
 */
export function ChallengeScoreboard({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ActiveChallengeResponse;
}) {
  const t = useTranslations("member.challenge");
  const qc = useQueryClient();
  const [sort, setSort] = useState<SortKey>("pace");
  const [friendsOnly, setFriendsOnly] = useState(false);

  const addFriend = useMutation({
    mutationFn: async (targetUserId: string) => {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["challenge-active"] }),
  });

  const { ranked, starting } = useMemo(() => {
    const rows = data.scoreboard.filter(
      (r) => !friendsOnly || r.isMe || r.friendStatus === "ACCEPTED",
    );
    // Anyone still inside the pace floor isn't ranked — a single class on day
    // one would otherwise show a pace nobody can sustain, at the top.
    const rankable = rows.filter((r) => (sort === "pace" ? r.pace != null : r.startsAt));
    const rest = rows.filter((r) => !rankable.includes(r));
    rankable.sort((a, b) =>
      sort === "pace"
        ? (b.pace ?? 0) - (a.pace ?? 0)
        : b.totalPoints - a.totalPoints || b.classesCount - a.classesCount,
    );
    return { ranked: rankable, starting: rest };
  }, [data.scoreboard, sort, friendsOnly]);

  const friendCount = data.scoreboard.filter((r) => r.friendStatus === "ACCEPTED").length;

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 z-50">
        <div className="max-h-[85dvh] overflow-y-auto rounded-t-[20px] bg-card px-5 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="sticky top-0 z-10 -mx-5 bg-card px-5 pb-3 pt-2.5">
            <div className="mb-3 flex justify-center">
              <div className="h-1 w-9 rounded-full bg-muted/30" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[17px] font-semibold">{data.challenge.name}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {t("boardSubtitle", { count: data.participantCount })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-full p-1.5 text-muted hover:bg-muted/10"
                aria-label={t("close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="flex rounded-lg bg-muted/10 p-0.5">
                {(["pace", "points"] as SortKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSort(k)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition",
                      sort === k ? "bg-card shadow-sm" : "text-muted",
                    )}
                  >
                    {t(k === "pace" ? "sortPace" : "sortPoints")}
                  </button>
                ))}
              </div>
              {friendCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFriendsOnly((v) => !v)}
                  className={cn(
                    "rounded-lg border px-3 py-1 text-xs font-medium transition",
                    friendsOnly
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 text-muted",
                  )}
                >
                  {t("friendsOnly", { count: friendCount })}
                </button>
              )}
            </div>
          </div>

          {sort === "pace" && (
            <p className="mb-3 rounded-lg bg-muted/10 px-3 py-2 text-[11px] leading-relaxed text-muted">
              {t("paceExplainer")}
            </p>
          )}

          <ul className="divide-y divide-border/40">
            {ranked.map((row, i) => (
              <Row
                key={row.userId}
                row={row}
                rank={i + 1}
                sort={sort}
                onAddFriend={() => addFriend.mutate(row.userId)}
                adding={addFriend.isPending && addFriend.variables === row.userId}
              />
            ))}
          </ul>

          {starting.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted/70">
                <Clock className="h-3 w-3" />
                {t("startingGroup", { days: data.paceMinDays })}
              </p>
              <ul className="divide-y divide-border/40">
                {starting.map((row) => (
                  <Row
                    key={row.userId}
                    row={row}
                    sort={sort}
                    onAddFriend={() => addFriend.mutate(row.userId)}
                    adding={addFriend.isPending && addFriend.variables === row.userId}
                  />
                ))}
              </ul>
            </div>
          )}

          {data.progress && <Checklist progress={data.progress} />}

          {data.challenge.prizes?.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted/70">
                {t("prizes")}
              </p>
              <ul className="space-y-1.5">
                {[...data.challenge.prizes]
                  .sort((a, b) => a.fromRank - b.fromRank)
                  .map((p, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-xl bg-muted/10 px-3 py-2 text-sm"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="font-medium tabular-nums">
                        {p.fromRank === p.toRank
                          ? `#${p.fromRank}`
                          : `#${p.fromRank}–${p.toRank}`}
                      </span>
                      <span className="text-muted">{p.title}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Row({
  row,
  rank,
  sort,
  onAddFriend,
  adding,
}: {
  row: ScoreboardRow;
  rank?: number;
  sort: SortKey;
  onAddFriend: () => void;
  adding: boolean;
}) {
  const t = useTranslations("member.challenge");
  const canAdd = !row.isMe && row.friendStatus == null;
  const pending = row.friendStatus === "PENDING";

  return (
    <li
      className={cn(
        "flex items-center gap-3 py-2.5",
        row.isMe && "-mx-2 rounded-xl bg-primary/10 px-2",
      )}
    >
      <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted">
        {rank ?? "·"}
      </span>
      <Avatar className="h-8 w-8">
        <AvatarImage src={row.image ?? undefined} />
        <AvatarFallback className="text-[10px]">
          {(row.name ?? "?").slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {row.isMe ? t("you") : (row.name ?? t("someone"))}
        </p>
        <p className="text-[11px] text-muted">
          {row.startsAt
            ? t("rowMeta", { classes: row.classesCount, points: row.totalPoints })
            : t("rowNotStarted")}
        </p>
      </div>
      {row.longestStreak > 1 && (
        <span className="flex items-center gap-0.5 text-[11px] text-muted">
          <Flame className="h-3 w-3 text-orange-500" />
          {row.longestStreak}
        </span>
      )}
      <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
        {sort === "pace" && row.pace != null ? row.pace : row.totalPoints}
      </span>
      {canAdd && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={onAddFriend}
          disabled={adding}
          aria-label={t("addFriend")}
        >
          <UserPlus className="h-3.5 w-3.5" />
        </Button>
      )}
      {pending && (
        <span className="w-7 shrink-0 text-center" title={t("requestSent")}>
          <Check className="mx-auto h-3.5 w-3.5 text-muted" />
        </span>
      )}
    </li>
  );
}

/** What's still worth a bonus — the reason to try something new this week. */
function Checklist({
  progress,
}: {
  progress: NonNullable<ActiveChallengeResponse["progress"]>;
}) {
  const t = useTranslations("member.challenge");
  const doneTypes = progress.disciplines.filter((d) => d.tried).length;
  const doneCoaches = progress.coaches.filter((c) => c.tried).length;

  return (
    <div className="mt-5 space-y-4">
      <div>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted/70">
          {t("disciplinesDone", {
            done: doneTypes,
            total: progress.disciplines.length,
          })}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {progress.disciplines.map((d) => (
            <span
              key={d.id}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs transition",
                !d.tried && "border border-dashed border-border text-muted",
              )}
              // Studios pick their own discipline colours, so a pale sand needs
              // dark text where a deep navy needs white.
              style={
                d.tried
                  ? { backgroundColor: d.color, color: readableTextColor(d.color) }
                  : undefined
              }
            >
              {d.tried && <Check className="mr-1 inline h-3 w-3" />}
              {d.name}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted/70">
          {t("coachesDone", { done: doneCoaches, total: progress.coaches.length })}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {progress.coaches.map((c) => (
            <span
              key={c.id}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                c.tried
                  ? "bg-primary/15 text-foreground"
                  : "border border-dashed border-border text-muted",
              )}
            >
              {c.tried && <Check className="mr-1 inline h-3 w-3" />}
              {c.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
