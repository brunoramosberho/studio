"use client";

import { useEffect, useState, useCallback } from "react";

interface RatingReason {
  id: string;
  text: string;
  emoji: string;
}

export function RatingSection({
  classId,
  classTypeId,
}: {
  classId: string;
  classTypeId: string;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [showReasons, setShowReasons] = useState(false);
  const [reasons, setReasons] = useState<RatingReason[]>([]);
  const [selectedReasons, setSelectedReasons] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [existingRating, setExistingRating] = useState<number | null>(null);

  // Check if there's an existing rating
  useEffect(() => {
    fetch(`/api/ratings?classId=${classId}`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.rating) {
          setExistingRating(data.rating);
          setRating(data.rating);
          setSubmitted(true);
        }
      })
      .catch(() => {});
  }, [classId]);

  const fetchReasons = useCallback(async () => {
    if (reasons.length > 0) return;
    const res = await fetch(`/api/ratings/reasons?classTypeId=${classTypeId}`);
    const data = await res.json();
    setReasons(data);
  }, [classTypeId, reasons.length]);

  const handleRating = async (r: number) => {
    const prevRating = rating;
    setRating(r);
    setSubmitting(true);

    await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId, rating: r, source: "class_page" }),
    });

    setSubmitting(false);

    if (r <= 3) {
      await fetchReasons();
      setShowReasons(true);
      setSubmitted(false);
    } else if (prevRating <= 3 && showReasons) {
      setShowReasons(false);
      setSubmitted(true);
    } else {
      setShowReasons(false);
      setSubmitted(true);
    }
  };

  const toggleReason = (text: string) => {
    setSelectedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(text)) next.delete(text);
      else next.add(text);
      return next;
    });
  };

  const submitReasons = async () => {
    if (selectedReasons.size === 0) return;
    setSubmitting(true);
    await fetch("/api/ratings/reasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId,
        reasons: Array.from(selectedReasons),
        ...(comment.trim() && { comment: comment.trim() }),
      }),
    });
    setSubmitting(false);
    setSubmitted(true);
    setShowReasons(false);
  };

  const stars = [1, 2, 3, 4, 5];
  const activeRating = hovered || rating;

  return (
    <div className="rounded-2xl border border-border/50 bg-white p-5">
      {submitted && !showReasons ? (
        /* Submitted state — can still change */
        <div className="text-center">
          <p className="text-[13px] text-muted mb-3">
            {existingRating ? "Tu calificación" : "¡Gracias por tu opinión!"}
          </p>
          <div className="flex justify-center gap-1 mb-2">
            {stars.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSubmitted(false);
                  handleRating(s);
                }}
                onMouseEnter={() => setHovered(s)}
                onMouseLeave={() => setHovered(0)}
                className="p-0.5 transition-transform active:scale-110"
              >
                <span
                  className={`text-[32px] transition-colors ${
                    s <= activeRating ? "text-amber-400" : "text-stone-200"
                  }`}
                >
                  ★
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : showReasons ? (
        /* Reasons selection */
        <div>
          {/* Editable stars */}
          <div className="flex justify-center gap-1 mb-3">
            {stars.map((s) => (
              <button
                key={s}
                onClick={() => handleRating(s)}
                onMouseEnter={() => setHovered(s)}
                onMouseLeave={() => setHovered(0)}
                disabled={submitting}
                className="p-0.5 transition-transform active:scale-110"
              >
                <span
                  className={`text-[28px] transition-colors ${
                    s <= activeRating ? "text-amber-400" : "text-stone-200"
                  }`}
                >
                  ★
                </span>
              </button>
            ))}
          </div>

          <h3 className="text-[15px] font-semibold text-foreground text-center mb-4">
            ¿Qué podríamos mejorar?
          </h3>
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {reasons.map((reason) => {
              const sel = selectedReasons.has(reason.text);
              return (
                <button
                  key={reason.id}
                  onClick={() => toggleReason(reason.text)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    sel
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-foreground"
                  }`}
                >
                  {reason.emoji} {reason.text}
                </button>
              );
            })}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="¿Algo más? (opcional)"
            rows={2}
            className="w-full rounded-[14px] border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 mb-3"
          />
          <button
            onClick={submitReasons}
            disabled={selectedReasons.size === 0 || submitting}
            className="w-full rounded-[14px] bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Enviar"}
          </button>
        </div>
      ) : (
        /* Initial rating prompt */
        <div className="text-center">
          <h3 className="text-[15px] font-semibold text-foreground mb-4">
            ¿Cómo te hicimos sentir?
          </h3>
          <div className="flex justify-center gap-1">
            {stars.map((s) => (
              <button
                key={s}
                onClick={() => handleRating(s)}
                onMouseEnter={() => setHovered(s)}
                onMouseLeave={() => setHovered(0)}
                disabled={submitting}
                className="p-1 transition-transform active:scale-110"
              >
                <span
                  className={`text-[38px] transition-colors ${
                    s <= activeRating ? "text-amber-400" : "text-stone-200"
                  }`}
                >
                  ★
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
