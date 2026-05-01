import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  verifyCloudflareStreamSignature,
  type CloudflareStreamWebhookPayload,
} from "@/lib/cloudflare-stream";

/**
 * Cloudflare Stream notifies us when an upload finishes processing. We use
 * the `uid` to find our OnDemandVideo row and fill in duration, dimensions,
 * thumbnail, and flip status to `ready` (or `errored`).
 *
 * Idempotency: relies on cloudflareStreamUid being unique per video and
 * status transitions being repeatable (writing `ready` twice is a no-op).
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("webhook-signature");

    if (!verifyCloudflareStreamSignature({ rawBody, signatureHeader })) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as CloudflareStreamWebhookPayload;
    if (!payload.uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const video = await prisma.onDemandVideo.findUnique({
      where: { cloudflareStreamUid: payload.uid },
    });
    if (!video) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const cfState = payload.status?.state;
    const ready = payload.readyToStream === true || cfState === "ready";

    let nextStatus: "processing" | "ready" | "errored" = video.status;
    if (ready) nextStatus = "ready";
    else if (cfState === "error") nextStatus = "errored";

    await prisma.onDemandVideo.update({
      where: { id: video.id },
      data: {
        status: nextStatus,
        ...(payload.duration !== undefined && {
          durationSeconds: Math.round(payload.duration),
        }),
        ...(payload.input?.width && { widthPx: payload.input.width }),
        ...(payload.input?.height && { heightPx: payload.input.height }),
        ...(payload.thumbnail && {
          cloudflareThumbnailUrl: payload.thumbnail,
          ...(video.thumbnailUrl ? {} : { thumbnailUrl: payload.thumbnail }),
        }),
        ...(cfState === "error" && {
          errorMessage: payload.status?.errorReasonText ?? "Cloudflare reported error",
        }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/webhooks/cloudflare-stream error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 400 });
  }
}
