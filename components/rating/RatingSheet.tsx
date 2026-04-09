"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { formatTime } from "@/lib/utils";

interface PendingClass {
  classId: string;
  className: string;
  classTypeId: string;
  classColor: string;
  classIcon: string | null;
  coachName: string;
  coachPhoto: string | null;
  coachColor: string;
  startsAt: string;
  endsAt: string;
}

interface RatingReason {
  id: string;
  text: string;
  emoji: string;
}

export function RatingSheet() {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  const [pending, setPending] = useState<PendingClass | null>(null);
  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [showReasons, setShowReasons] = useState(false);
  const [reasons, setReasons] = useState<RatingReason[]>([]);
  const [selectedReasons, setSelectedReasons] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAdmin) return;
    fetch("/api/ratings/pending")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PendingClass | null) => {
        if (!data || !data.classId) return;
        const key = `rating_dismissed_${data.classId}`;
        if (typeof window !== "undefined" && localStorage.getItem(key)) return;
        setTimeout(() => {
          setPending(data);
          setVisible(true);
        }, 1500);
      })
      .catch(() => {});
  }, [isAdmin]);

  const dismiss = useCallback(() => {
    if (pending) {
      localStorage.setItem(`rating_dismissed_${pending.classId}`, "1");
    }
    setVisible(false);
    setTimeout(() => setPending(null), 300);
  }, [pending]);

  const prefetchReasons = useCallback(async () => {
    if (!pending || reasons.length > 0) return;
    const res = await fetch(`/api/ratings/reasons?classTypeId=${pending.classTypeId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;
    setReasons(data);
  }, [pending, reasons.length]);

  const handleRating = async (r: number) => {
    if (!pending) return;
    const prevRating = rating;
    setRating(r);
    setSubmitting(true);

    await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId: pending.classId, rating: r, source: "app_sheet" }),
    });

    setSubmitting(false);

    if (r <= 3) {
      await prefetchReasons();
      setShowReasons(true);
    } else if (prevRating <= 3 && showReasons) {
      // Changed from low to high — leave reasons view, go to thank you
      setShowReasons(false);
      setSubmitted(true);
    } else {
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
    if (!pending || selectedReasons.size === 0) return;
    setSubmitting(true);
    await fetch("/api/ratings/reasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: pending.classId,
        reasons: Array.from(selectedReasons),
        ...(comment.trim() && { comment: comment.trim() }),
      }),
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  if (!pending || isAdmin) return null;

  const stars = [1, 2, 3, 4, 5];
  const activeRating = hovered || rating;

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={dismiss}
      />

      {/* Sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="bg-white rounded-t-[20px] px-6 pb-[max(24px,env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto">
          {/* Handle */}
          <div className="flex justify-center pt-2.5 mb-4">
            <div className="w-9 h-1 rounded-full bg-stone-200" />
          </div>

          {submitted ? (
            /* Thank-you state */
            <div className="text-center py-6">
              <div className="text-4xl mb-3">🙏</div>
              <h2 className="text-[17px] font-semibold text-stone-900 mb-1">¡Gracias!</h2>
              <p className="text-sm text-stone-500 mb-4">Tu opinión nos ayuda a mejorar.</p>
              {/* Editable stars in thank-you */}
              <div className="flex justify-center gap-1 mb-6">
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
                      className={`text-[28px] transition-colors ${
                        s <= activeRating ? "text-amber-400" : "text-stone-200"
                      }`}
                    >
                      ★
                    </span>
                  </button>
                ))}
              </div>
              <button onClick={dismiss} className="text-stone-400 text-[13px]">
                Cerrar
              </button>
            </div>
          ) : showReasons ? (
            /* Reasons selection */
            <div className="py-2">
              {/* Editable stars */}
              <div className="flex justify-center gap-1 mb-4">
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

              <h2 className="text-[17px] font-semibold text-stone-900 text-center mb-5">
                ¿Qué podríamos mejorar?
              </h2>
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
                          : "border-stone-200 text-stone-700"
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
                className="w-full rounded-[14px] border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 mb-4"
              />
              <button
                onClick={submitReasons}
                disabled={selectedReasons.size === 0 || submitting}
                className="w-full rounded-[14px] bg-accent py-3 text-sm font-semibold text-white disabled:opacity-50 mb-3"
              >
                {submitting ? "Enviando..." : "Enviar"}
              </button>
              <button onClick={dismiss} className="w-full text-stone-400 text-[13px] text-center">
                Ahora no
              </button>
            </div>
          ) : (
            /* Main rating view */
            <div className="py-2">
              <h2 className="text-[17px] font-semibold text-stone-900 text-center mb-4">
                ¿Cómo te hicimos sentir hoy?
              </h2>

              {/* Class chip */}
              <div className="bg-stone-100 rounded-[14px] p-2.5 flex gap-2.5 items-center mb-6">
                {pending.coachPhoto ? (
                  <img
                    src={pending.coachPhoto}
                    alt={pending.coachName}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                    style={{ background: pending.coachColor }}
                  >
                    {pending.coachName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-stone-900 truncate">
                    {pending.className}
                  </p>
                  <p className="text-[11px] text-stone-500">
                    {pending.coachName} · {formatTime(pending.startsAt)}
                  </p>
                </div>
              </div>

              {/* Stars */}
              <div className="flex justify-center gap-1 mb-6">
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

              <button onClick={dismiss} className="w-full text-stone-400 text-[13px] text-center">
                Ahora no
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
