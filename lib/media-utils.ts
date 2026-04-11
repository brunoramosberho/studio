/**
 * Client-side media helpers for video poster capture and upload.
 */

const POSTER_WIDTH = 640;
const POSTER_QUALITY = 0.7;

export function captureVideoPoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, video.duration / 2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth, POSTER_WIDTH);
        canvas.height = Math.round(
          (canvas.width / video.videoWidth) * video.videoHeight,
        );
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            resolve(blob);
          },
          "image/jpeg",
          POSTER_QUALITY,
        );
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(null);
    }, 8000);
    video.src = url;
  });
}

export async function uploadVideoPosterToStorage(
  eventId: string,
  videoFilename: string,
  poster: Blob,
): Promise<string | null> {
  try {
    const thumbRes = await fetch(`/api/feed/${eventId}/photos/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: videoFilename.replace(/\.[^.]+$/, "-thumb.jpg"),
        contentType: "image/jpeg",
      }),
    });
    if (!thumbRes.ok) return null;

    const { signedUrl, publicUrl } = await thumbRes.json();
    const putRes = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: poster,
    });
    return putRes.ok ? publicUrl : null;
  } catch {
    return null;
  }
}
