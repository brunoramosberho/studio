/**
 * Client-side media helpers for video poster capture and upload.
 */

const POSTER_WIDTH = 640;
const POSTER_QUALITY = 0.7;

const IMAGE_MAX_DIMENSION = 1920;
const IMAGE_JPEG_QUALITY = 0.8;
const IMAGE_SIZE_THRESHOLD = 2 * 1024 * 1024;

/**
 * Downscale + re-encode an image so uploads stay well under serverless body
 * limits (~4.5MB on Vercel — large phone photos otherwise fail). Returns the
 * original file for non-images or when it's already small enough.
 */
export function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return Promise.resolve(file);

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const needsResize = width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION;
      if (!needsResize && file.size < IMAGE_SIZE_THRESHOLD) {
        resolve(file);
        return;
      }

      if (width > height && width > IMAGE_MAX_DIMENSION) {
        height = Math.round((height / width) * IMAGE_MAX_DIMENSION);
        width = IMAGE_MAX_DIMENSION;
      } else if (height > IMAGE_MAX_DIMENSION) {
        width = Math.round((width / height) * IMAGE_MAX_DIMENSION);
        height = IMAGE_MAX_DIMENSION;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const ext = file.name.replace(/\.[^.]+$/, "");
            resolve(new File([blob], `${ext}.jpg`, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        IMAGE_JPEG_QUALITY,
      );
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

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
