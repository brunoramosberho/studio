import webpush from "web-push";
import { prisma } from "@/lib/db";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

let vapidReady = false;

function ensureVapid() {
  if (vapidReady || !VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const subject = appUrl.startsWith("https://")
    ? appUrl
    : `mailto:${process.env.VAPID_CONTACT_EMAIL || "push@example.com"}`;
  webpush.setVapidDetails(subject, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidReady = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
}

/**
 * Extract attendee + coach user IDs from a CLASS_COMPLETED feed event payload.
 */
export function getClassPostRecipients(
  payload: Record<string, unknown>,
  excludeUserId?: string,
): string[] {
  const attendees = (payload.attendees as { id: string }[]) ?? [];
  const coachUserId = payload.coachUserId as string | undefined;
  const ids = new Set(attendees.map((a) => a.id));
  if (coachUserId) ids.add(coachUserId);
  if (excludeUserId) ids.delete(excludeUserId);
  return Array.from(ids);
}

/**
 * Send a push notification to all devices registered by a user.
 * Automatically cleans up stale subscriptions (410/404).
 */
export async function sendPushToUser(userId: string, payload: PushPayload, tenantId?: string) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  ensureVapid();

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, ...(tenantId ? { tenantId } : {}) },
  });

  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);
  const staleIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          staleIds.push(sub.id);
        }
      }
    }),
  );

  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: staleIds } },
    });
  }
}

/**
 * Send a push notification to multiple users.
 * Returns a Promise so callers in serverless contexts (e.g. cron jobs) can
 * await delivery before the function terminates. Callers that want
 * fire-and-forget behavior can simply not await the returned Promise.
 */
export function sendPushToMany(
  userIds: string[],
  payload: PushPayload,
  tenantId?: string,
): Promise<void> {
  return Promise.allSettled(
    userIds.map((uid) => sendPushToUser(uid, payload, tenantId)),
  ).then(() => undefined);
}
