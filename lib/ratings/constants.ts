/**
 * At or below this rating we ask what went wrong (reason chips + free-text
 * comment) instead of going straight to "thanks". Kept here because three
 * entry points share the scale — the post-class sheet, the class page and
 * the emailed rating link — and they must not drift apart.
 */
export const RATING_FEEDBACK_THRESHOLD = 4;

export const DEFAULT_RATING_REASONS = [
  { emoji: "👤", text: "La atención del coach" },
  { emoji: "🛎️", text: "El trato del staff" },
  { emoji: "💪", text: "El nivel de dificultad" },
  { emoji: "🎵", text: "El ambiente de la clase" },
  { emoji: "🏠", text: "El espacio" },
  { emoji: "⏰", text: "La duración de la clase" },
  { emoji: "😤", text: "Me sentí fuera de lugar" },
] as const;
