import { AlertTriangle } from "lucide-react";

interface Props {
  notes: string;
}

export function PendingBanner({ notes }: Props) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            Necesita completarse después del onboarding:
          </p>
          <p className="mt-1 text-sm text-amber-700">
            Salas por estudio &middot; Horario semanal
          </p>
          {notes && (
            <p className="mt-2 text-xs text-amber-600">{notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}
