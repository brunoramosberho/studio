import Link from "next/link";

export function TokenExpiredPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface text-3xl">
          ⏰
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Este enlace ha expirado
        </h1>
        <p className="text-sm text-muted mb-8 leading-relaxed">
          Los enlaces de calificación son válidos por 7 días.
          Puedes calificar la clase directamente desde la app.
        </p>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-8 text-sm font-semibold text-white"
        >
          Ir a la app
        </Link>
      </div>
    </div>
  );
}
