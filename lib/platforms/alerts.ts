import { prisma } from "@/lib/db";
import type { PlatformType } from "@prisma/client";

export type AlertType =
  | "quota_full"
  | "class_full"
  | "spot_freed"
  | "unmatched_booking"
  | "wellhub_sync_error"
  | "wellhub_booking_rejected"
  | "wellhub_reconciliation_mismatch";

const ALERT_MESSAGES: Record<AlertType, (...args: string[]) => string> = {
  quota_full: (className: string, platform: string) =>
    `El quota de ${platform} para ${className} está lleno. ${platform} dejará de mostrar la clase automáticamente.`,
  class_full: (className: string) =>
    `${className} está llena con miembros directos. Revisa los spots activos en las plataformas externas para evitar doble booking.`,
  spot_freed: (className: string) =>
    `Se liberó un spot en ${className}. ¿Quieres abrir spots en plataformas externas?`,
  unmatched_booking: () =>
    `Llegó una reserva de plataforma que no pudimos asociar a ninguna clase. Revísala y regístrala manualmente.`,
  wellhub_sync_error: (className: string) =>
    `Falló la sincronización con Wellhub para ${className}. Revisa los logs y reintenta.`,
  wellhub_booking_rejected: (className: string) =>
    `Una reserva de Wellhub en ${className} fue rechazada automáticamente (sin cupo o ventana cerrada).`,
  wellhub_reconciliation_mismatch: () =>
    `Diferencias entre visitas registradas en Wellhub y en Magic durante el mes anterior. Revisa el reporte de liquidación.`,
};

export async function createPlatformAlert({
  tenantId,
  classId,
  platform,
  type,
  className,
}: {
  tenantId: string;
  classId?: string;
  platform: PlatformType;
  type: AlertType;
  className?: string;
}) {
  const platformLabel = platform === "classpass" ? "ClassPass" : "Wellhub";
  const message = ALERT_MESSAGES[type](className ?? "Clase", platformLabel);

  return prisma.platformAlert.create({
    data: {
      tenantId,
      classId: classId ?? null,
      platform,
      type,
      message,
    },
  });
}

export async function resolveAlertsForClass(
  tenantId: string,
  classId: string,
  type: AlertType,
  resolvedBy: string,
) {
  return prisma.platformAlert.updateMany({
    where: { tenantId, classId, type, isResolved: false },
    data: { isResolved: true, resolvedAt: new Date(), resolvedBy },
  });
}
