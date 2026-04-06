"use client";

import { useState, useTransition } from "react";
import { BarChart3, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PollOption {
  id: string;
  text: string;
  position: number;
  voteCount: number;
}

export interface PollData {
  id: string;
  title: string | null;
  totalVotes: number;
  myVote: string | null;
  options: PollOption[];
}

interface PollCardProps {
  poll: PollData;
  eventId: string;
}

export function PollCard({ poll, eventId }: PollCardProps) {
  const [myVote, setMyVote] = useState(poll.myVote);
  const [totalVotes, setTotalVotes] = useState(poll.totalVotes);
  const [options, setOptions] = useState(poll.options);
  const [isPending, startTransition] = useTransition();

  const hasVoted = myVote !== null;

  const handleVote = (optionId: string) => {
    const prevVote = myVote;
    const prevTotal = totalVotes;
    const prevOptions = options;

    if (prevVote === optionId) {
      setMyVote(null);
      setTotalVotes((t) => t - 1);
      setOptions((opts) =>
        opts.map((o) =>
          o.id === optionId ? { ...o, voteCount: o.voteCount - 1 } : o,
        ),
      );
    } else {
      setMyVote(optionId);
      setTotalVotes((t) => t + (prevVote ? 0 : 1));
      setOptions((opts) =>
        opts.map((o) => {
          if (o.id === optionId) return { ...o, voteCount: o.voteCount + 1 };
          if (o.id === prevVote) return { ...o, voteCount: o.voteCount - 1 };
          return o;
        }),
      );
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/feed/${eventId}/polls/${poll.id}/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setMyVote(prevVote);
        setTotalVotes(prevTotal);
        setOptions(prevOptions);
      }
    });
  };

  const maxVotes = Math.max(...options.map((o) => o.voteCount), 1);

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-border/60 bg-surface/30 p-4">
      {poll.title && (
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-accent" />
          <p className="text-[14px] font-semibold text-foreground">{poll.title}</p>
        </div>
      )}

      <div className="space-y-2">
        {options.map((option) => {
          const isMyVote = myVote === option.id;
          const pct = totalVotes > 0 ? Math.round((option.voteCount / totalVotes) * 100) : 0;

          return (
            <button
              key={option.id}
              onClick={() => handleVote(option.id)}
              disabled={isPending}
              className={cn(
                "relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-all active:scale-[0.99]",
                isMyVote
                  ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                  : hasVoted
                    ? "border-border/50 bg-white"
                    : "border-border/60 bg-white hover:border-accent/40 hover:bg-accent/5",
              )}
            >
              {hasVoted && (
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 transition-all duration-500 ease-out",
                    isMyVote ? "bg-accent/10" : "bg-border/20",
                  )}
                  style={{ width: `${pct}%` }}
                />
              )}

              <div className="relative z-10 flex flex-1 items-center gap-2.5">
                {isMyVote && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                )}
                <span
                  className={cn(
                    "text-[13px]",
                    isMyVote ? "font-semibold text-accent" : "font-medium text-foreground/85",
                  )}
                >
                  {option.text}
                </span>
              </div>

              {hasVoted && (
                <span
                  className={cn(
                    "relative z-10 text-[12px] tabular-nums",
                    isMyVote ? "font-semibold text-accent" : "text-muted",
                  )}
                >
                  {pct}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2.5 text-[11px] text-muted">
        {totalVotes} {totalVotes === 1 ? "voto" : "votos"}
        {hasVoted && " · Toca para cambiar tu voto"}
      </p>
    </div>
  );
}
