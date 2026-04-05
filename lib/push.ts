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
