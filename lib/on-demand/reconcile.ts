/**
 * Self-healing for videos stuck in `processing`.
 *
 * A video's status only ever moved when Cloudflare's webhook reached us, with
 * nothing to fall back on. When that webhook was pointing at a dead host, every
 * upload sat at "Processing…" forever — no error, no timeout, no way out from
 * the admin. One missed delivery is all it takes.
 *
 * So the admin list now asks Cloudflare directly about anything that has been
 * processing for a while. The webhook stays as the fast path; this is the
 * backstop that makes a lost notification cost a page refresh instead of a
 * support ticket.
 */

import { prisma } from "@/lib/db";
import { getVideoMeta } from "@/lib/cloudflare-stream";

/**
 * How long to let the webhook do its job before we go asking. Real encodes
 * take minutes, so this isn't a race — it just avoids a pointless API call on
 * every list load right after an upload.
 */
export const RECONCILE_AFTER_MS = 2 * 60 * 1000;

/** Bounded so a backlog can't turn one page load into fifty API calls. */
export const RECONCILE_BATCH = 10;

export interface ReconcilableVideo {
  id: string;
  cloudflareStreamUid: string;
  status: "processing" | "ready" | "errored";
  createdAt: Date;
}

export interface ReconciledFields {
  status: "processing" | "ready" | "errored";
  durationSeconds?: number;
  widthPx?: number;
  heightPx?: number;
  cloudflareThumbnailUrl?: string;
  errorMessage?: string | null;
}

export function needsReconcile(video: ReconcilableVideo, now: Date = new Date()): boolean {
  return (
    video.status === "processing" &&
    now.getTime() - video.createdAt.getTime() > RECONCILE_AFTER_MS
  );
}

/**
 * Ask Cloudflare about the stalled videos and persist whatever it says.
 * Returns the new field values keyed by video id, so the caller can merge them
 * into the response it already built instead of re-querying.
 *
 * Never throws: a reconcile is a bonus, and Cloudflare being unreachable must
 * not take down the admin's video library.
 */
export async function reconcileStalledVideos(
  videos: ReconcilableVideo[],
  now: Date = new Date(),
): Promise<Map<string, ReconciledFields>> {
  const stalled = videos.filter((v) => needsReconcile(v, now)).slice(0, RECONCILE_BATCH);
  const results = new Map<string, ReconciledFields>();

  await Promise.all(
    stalled.map(async (video) => {
      try {
        const meta = await getVideoMeta(video.cloudflareStreamUid);
        const state = meta.status?.state;
        const ready = meta.readyToStream === true || state === "ready";
        if (!ready && state !== "error") return; // genuinely still encoding

        const fields: ReconciledFields = ready
          ? {
              status: "ready",
              ...(meta.duration !== undefined && {
                durationSeconds: Math.round(meta.duration),
              }),
              ...(meta.input?.width && { widthPx: meta.input.width }),
              ...(meta.input?.height && { heightPx: meta.input.height }),
              ...(meta.thumbnail && { cloudflareThumbnailUrl: meta.thumbnail }),
              errorMessage: null,
            }
          : {
              status: "errored",
              errorMessage: meta.status?.errorReasonText ?? "Cloudflare reported an error",
            };

        await prisma.onDemandVideo.update({ where: { id: video.id }, data: fields });
        results.set(video.id, fields);
      } catch (err) {
        console.error(`On-demand reconcile failed for ${video.cloudflareStreamUid}:`, err);
      }
    }),
  );

  return results;
}
