import { prisma } from "@/lib/db";

export type MemberWaiverStatus =
  | "not_required"
  | "pending"
  | "signed"
  | "needs_resign";

export interface WaiverStatusResult {
  status: MemberWaiverStatus;
  waiverId?: string;
  version?: number;
  blockCheckin?: boolean;
  triggers?: {
    onBooking: boolean;
    onFirstOpen: boolean;
  };
}

export async function getMemberWaiverStatus(
  memberId: string,
  tenantId: string,
): Promise<WaiverStatusResult> {
  const activeWaiver = await prisma.waiver.findFirst({
    where: { tenantId, status: "active" },
    select: {
      id: true,
      version: true,
      blockCheckinWithoutSignature: true,
      triggerOnBooking: true,
      triggerOnFirstOpen: true,
    },
  });

  if (!activeWaiver) {
    return { status: "not_required" };
  }

  const triggers = {
    onBooking: activeWaiver.triggerOnBooking,
    onFirstOpen: activeWaiver.triggerOnFirstOpen,
  };

  const signature = await prisma.waiverSignature.findUnique({
    where: { waiverId_memberId: { waiverId: activeWaiver.id, memberId } },
    select: { waiverVersion: true },
  });

  if (!signature) {
    return {
      status: "pending",
      waiverId: activeWaiver.id,
      version: activeWaiver.version,
      blockCheckin: activeWaiver.blockCheckinWithoutSignature,
      triggers,
    };
  }

  if (signature.waiverVersion < activeWaiver.version) {
    return {
      status: "needs_resign",
      waiverId: activeWaiver.id,
      version: activeWaiver.version,
      blockCheckin: activeWaiver.blockCheckinWithoutSignature,
      triggers,
    };
  }

  return { status: "signed" };
}
