import "server-only";
import { prisma } from "@/lib/db";
import { sendPushToMany, sendPushToUser } from "@/lib/push";
import {
  getTenantBaseUrl,
  sendAvailabilityApprovedToCoach,
  sendAvailabilityRejectedToCoach,
  sendAvailabilityRequestToAdmin,
} from "@/lib/email";
import { getBrandingForTenantId } from "@/lib/branding.server";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type TenantNotifyFlags = {
  notifyEmailOnRequest: boolean;
  notifyPushOnRequest: boolean;
};

async function getTenantNotifyFlags(
  tenantId: string,
): Promise<TenantNotifyFlags> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { notifyEmailOnRequest: true, notifyPushOnRequest: true },
  });
  return {
    notifyEmailOnRequest: t?.notifyEmailOnRequest ?? true,
    notifyPushOnRequest: t?.notifyPushOnRequest ?? true,
  };
}

async function getAdminRecipients(tenantId: string) {
  const memberships = await prisma.membership.findMany({
    where: { tenantId, role: { in: ["ADMIN", "FRONT_DESK"] } },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  // Only ADMINs get availability-request notifications by default.
  return memberships
    .filter((m) => m.role === "ADMIN")
    .map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name ?? "",
    }));
}

export interface AvailabilityRequestArgs {
  tenantId: string;
  tenantSlug: string;
  block: {
    id: string;
    type: "one_time" | "recurring";
    startDate: Date | null;
    endDate: Date | null;
    dayOfWeek: number[];
    startTime: string | null;
    endTime: string | null;
    isAllDay: boolean;
    reasonType: string;
    reasonNote: string | null;
  };
  coachName: string;
  zone: "green" | "yellow" | "red";
}

export async function notifyAdminsOfAvailabilityRequest(
  args: AvailabilityRequestArgs,
): Promise<void> {
  const flags = await getTenantNotifyFlags(args.tenantId);
  if (!flags.notifyEmailOnRequest && !flags.notifyPushOnRequest) return;

  const admins = await getAdminRecipients(args.tenantId);
  if (admins.length === 0) return;

  const branding = await getBrandingForTenantId(args.tenantId);
  const reviewUrl = `${getTenantBaseUrl(args.tenantSlug)}/admin/availability`;

  const summary =
    args.block.type === "one_time" && args.block.startDate
      ? args.block.endDate &&
        args.block.startDate.getTime() !== args.block.endDate.getTime()
        ? `${format(args.block.startDate, "d MMM", { locale: es })} – ${format(args.block.endDate, "d MMM", { locale: es })}`
        : format(args.block.startDate, "d MMM", { locale: es })
      : "horario recurrente";

  // In-app notifications (always — they're cheap and surface in the bell).
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.userId,
      tenantId: args.tenantId,
      type: "availability_requested",
    })),
  });

  if (flags.notifyPushOnRequest) {
    await sendPushToMany(
      admins.map((a) => a.userId),
      {
        title: `Solicitud de disponibilidad`,
        body: `${args.coachName} solicita bloquear ${summary}`,
        url: "/admin/availability",
        tag: `availability-${args.block.id}`,
      },
      args.tenantId,
    );
  }

  if (flags.notifyEmailOnRequest) {
    await Promise.allSettled(
      admins
        .filter((a) => a.email)
        .map((a) =>
          sendAvailabilityRequestToAdmin({
            to: a.email!,
            toName: a.name,
            coachName: args.coachName,
            type: args.block.type,
            startDate: args.block.startDate,
            endDate: args.block.endDate,
            dayOfWeek: args.block.dayOfWeek,
            startTime: args.block.startTime,
            endTime: args.block.endTime,
            isAllDay: args.block.isAllDay,
            reasonType: args.block.reasonType,
            reasonNote: args.block.reasonNote,
            zone: args.zone,
            reviewUrl,
            branding,
          }),
        ),
    );
  }
}

export interface AvailabilityReviewArgs {
  tenantId: string;
  tenantSlug: string;
  action: "approve" | "reject";
  coachUserId: string;
  coachEmail: string | null;
  coachName: string;
  startDate: Date | null;
  endDate: Date | null;
  reasonType: string;
  rejectionNote: string | null;
}

export async function notifyCoachOfAvailabilityReview(
  args: AvailabilityReviewArgs,
): Promise<void> {
  const branding = await getBrandingForTenantId(args.tenantId);
  const scheduleUrl = `${getTenantBaseUrl(args.tenantSlug)}/coach/availability`;

  const rangeText =
    args.startDate && args.endDate
      ? args.startDate.getTime() === args.endDate.getTime()
        ? format(args.startDate, "d MMM", { locale: es })
        : `${format(args.startDate, "d MMM", { locale: es })} – ${format(args.endDate, "d MMM", { locale: es })}`
      : "tus fechas solicitadas";

  await sendPushToUser(
    args.coachUserId,
    {
      title:
        args.action === "approve"
          ? "Disponibilidad aprobada"
          : "Disponibilidad rechazada",
      body:
        args.action === "approve"
          ? `Tu bloqueo de ${rangeText} fue aprobado`
          : `Tu solicitud de ${rangeText} no fue aprobada`,
      url: "/coach/availability",
    },
    args.tenantId,
  );

  if (args.coachEmail) {
    if (args.action === "approve") {
      await sendAvailabilityApprovedToCoach({
        to: args.coachEmail,
        toName: args.coachName,
        startDate: args.startDate,
        endDate: args.endDate,
        reasonType: args.reasonType,
        scheduleUrl,
        branding,
      });
    } else {
      await sendAvailabilityRejectedToCoach({
        to: args.coachEmail,
        toName: args.coachName,
        startDate: args.startDate,
        endDate: args.endDate,
        reasonType: args.reasonType,
        rejectionNote: args.rejectionNote,
        scheduleUrl,
        branding,
      });
    }
  }
}
