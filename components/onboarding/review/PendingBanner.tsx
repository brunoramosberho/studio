import { AlertTriangle, CheckCircle } from "lucide-react";

interface Props {
  notes: string;
  hasSchedule: boolean;
}

export function PendingBanner({ notes, hasSchedule }: Props) {
  const pending = ["Salas por estudio"];
  if (!hasSchedule) pending.push("Horario semanal");

  return (
    <div className="space-y-3">
      {hasSchedule && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-800">
              Se generarán clases demo para las próximas 2 semanas basadas en el horario detectado
            </p>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              Se configurará automáticamente al crear:
            </p>
            <p className="mt-1 text-sm text-amber-700">
              {pending.join(" · ")} · Usuarios demo · Feed de actividad
            </p>
            {notes && (
              <p className="mt-2 text-xs text-amber-600">{notes}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
