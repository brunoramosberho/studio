"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/utils";

interface RatingReason {
  id: string;
  text: string;
  emoji: string;
}

export function RatingReasonsPage({
  classId,
  classTypeId,
  className,
  coachName,
  coachPhoto,
  coachColor,
  startsAt,
  rating,
  isLoggedIn,
}: {
  classId: string;
  classTypeId: string;
  className: string;
  coachName: string;
  coachPhoto: string | null;
  coachColor: string;
  startsAt: string;
  rating: number;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [reasons, setReasons] = useState<RatingReason[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/ratings/reasons?classTypeId=${classTypeId}`)
      .then((r) => r.json())
      .then(setReasons)
      .catch(() => {});
  }, [classTypeId]);

  const toggle = (text: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await fetch("/api/ratings/reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          reasons: Array.from(selected),
          ...(comment.trim() && { comment: comment.trim() }),
        }),
      });
      setDone(true);
    } catch {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface text-3xl">
            🙏
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">¡Gracias!</h1>
          <p className="text-sm text-muted leading-relaxed">
            Tu opinión nos ayuda a mejorar.
          </p>
        </div>
      </div>
    );
  }

  const stars = Array.from({ length: 5 }, (_, i) => i + 1);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Stars display (read-only showing what they picked) */}
        <div className="flex justify-center gap-1 mb-6">
          {stars.map((s) => (
            <span
              key={s}
              className={`text-[38px] ${s <= rating ? "text-amber-400" : "text-stone-200"}`}
            >
              ★
            </span>
          ))}
        </div>

        {/* Class chip */}
        <div className="bg-surface rounded-[14px] p-2.5 flex gap-2.5 items-center mb-6">
          {coachPhoto ? (
            <img
              src={coachPhoto}
              alt={coachName}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
              style={{ background: coachColor }}
            >
              {coachName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate">
              {className}
            </p>
            <p className="text-[11px] text-muted">
              {coachName} · {startsAt ? formatTime(startsAt) : ""}
            </p>
          </div>
        </div>

        <h1 className="text-[17px] font-semibold text-foreground text-center mb-5">
          ¿Qué podríamos mejorar?
        </h1>

        {/* Reasons grid */}
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          {reasons.map((reason) => {
            const isSelected = selected.has(reason.text);
            return (
              <button
                key={reason.id}
                onClick={() => toggle(reason.text)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  isSelected
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-foreground"
                }`}
              >
                {reason.emoji} {reason.text}
              </button>
            );
          })}
        </div>

        {/* Optional comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="¿Algo más que quieras contarnos? (opcional)"
          rows={3}
          className="w-full rounded-[14px] border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 mb-4"
        />

        <button
          onClick={handleSubmit}
          disabled={selected.size === 0 || submitting}
          className="w-full rounded-[14px] bg-accent py-3 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
        >
          {submitting ? "Enviando..." : "Enviar"}
        </button>
      </div>
    </div>
  );
}
