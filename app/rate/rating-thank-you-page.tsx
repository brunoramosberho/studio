import { formatTime } from "@/lib/utils";

export function RatingThankYouPage({
  rating,
  className,
  coachName,
  coachPhoto,
  coachColor,
  startsAt,
}: {
  rating: number;
  classId: string;
  className: string;
  coachName: string;
  coachPhoto: string | null;
  coachColor: string;
  startsAt: string;
  isLoggedIn: boolean;
}) {
  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface text-3xl">
          🙏
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          ¡Gracias!
        </h1>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          Tu opinión nos ayuda a mejorar.
        </p>

        {/* Stars (read-only) */}
        <div className="flex justify-center gap-1 mb-6">
          {stars.map((s) => (
            <span
              key={s}
              className={`text-[32px] ${s <= rating ? "text-amber-400" : "text-stone-200"}`}
            >
              ★
            </span>
          ))}
        </div>

        {/* Class chip */}
        <div className="bg-surface rounded-[14px] p-2.5 flex gap-2.5 items-center mb-8">
          {coachPhoto ? (
            <img
              src={coachPhoto}
              alt={coachName}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
              style={{ background: coachColor }}
            >
              {coachName.charAt(0)}
            </div>
          )}
          <div className="min-w-0 text-left">
            <p className="text-[13px] font-semibold text-foreground truncate">
              {className}
            </p>
            <p className="text-[11px] text-muted">
              {coachName} · {startsAt ? formatTime(startsAt) : ""}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
