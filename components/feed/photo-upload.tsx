"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, Loader2, X, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { captureVideoPoster, uploadVideoPosterToStorage, compressImage } from "@/lib/media-utils";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const MAX_VIDEO_SIZE_LABEL = "100";
const MAX_VIDEO_DURATION = 60;
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(video.duration) ? video.duration : Infinity);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot read video"));
    };
    video.src = url;
  });
}


class UploadError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

function uploadWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadError(xhr.status, `Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new UploadError(0, "Network error"));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}

interface PendingFile {
  file: File;
  previewUrl: string;
  isVideo: boolean;
}

interface PhotoUploadProps {
  eventId: string;
  onUploaded?: (photo: {
    id: string;
    url: string;
    mimeType: string;
    userId?: string;
    user?: { name: string | null; image: string | null } | null;
  }) => void;
  /**
   * When set, the trigger renders as a labeled CTA (icon + text, accent-tinted)
   * instead of a bare camera icon — so members realize they can add a photo.
   * Omit where a sibling already labels it (e.g. the instructor tools).
   */
  label?: string;
}

export function PhotoUpload({ eventId, onUploaded, label }: PhotoUploadProps) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A rejected-file message (wrong format / too big / too long) is set BEFORE
  // the preview overlay opens, so the in-overlay banner alone would be invisible
  // and the upload would appear to fail silently. Toast it too so the reason is
  // always shown.
  const rejectFile = (msg: string) => {
    setValidationError(msg);
    toast.error(msg);
  };
  // An upload-time failure. The overlay is open here, but toast as well so it's
  // never missed.
  const fail = (msg: string) => {
    setError(msg);
    toast.error(msg);
  };

  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setValidationError(null);

    const items: PendingFile[] = [];
    for (const file of Array.from(files)) {
      const isVid = file.type.startsWith("video/");

      if (isVid && !ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        rejectFile("Formato de video no soportado. Usa MP4 o WebM.");
        return;
      }

      if (isVid && file.size > MAX_VIDEO_SIZE) {
        rejectFile(
          `Video demasiado pesado (${(file.size / 1024 / 1024).toFixed(0)} MB). Máximo: ${MAX_VIDEO_SIZE_LABEL} MB.`,
        );
        return;
      }

      items.push({
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo: isVid,
      });
    }

    setPending(items);

    const videos = items.filter((i) => i.isVideo);
    if (videos.length > 0) {
      Promise.all(videos.map((v) => getVideoDuration(v.file)))
        .then((durations) => {
          const tooLong = durations.find(
            (d) => d !== Infinity && d > MAX_VIDEO_DURATION,
          );
          if (tooLong !== undefined) {
            rejectFile(
              `El video dura ${Math.ceil(tooLong)}s. Máximo: ${MAX_VIDEO_DURATION}s.`,
            );
          }
        })
        .catch(() => {});
    }
  };

  const cancel = () => {
    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPending([]);
    setError(null);
    setValidationError(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const confirm = async () => {
    setUploading(true);
    setError(null);
    setProgress(null);
    let succeeded = 0;

    for (let idx = 0; idx < pending.length; idx++) {
      const item = pending[idx];

      if (item.isVideo) {
        // Upload the bytes to storage, retrying transient/network failures (a
        // dropped upload on flaky studio wifi is the common cause). Each retry
        // gets a fresh single-use signed URL. A 413 (too big for the storage
        // backend) and prep failures (auth) are permanent — don't retry those.
        const MAX_TRIES = 3;
        let publicUrl: string | null = null;
        let permanent = false;

        for (let tryN = 1; tryN <= MAX_TRIES && publicUrl === null && !permanent; tryN++) {
          try {
            const urlRes = await fetch(`/api/feed/${eventId}/photos/upload-url`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filename: item.file.name,
                contentType: item.file.type,
              }),
            });

            if (!urlRes.ok) {
              const data = await urlRes.json().catch(() => ({}));
              fail(data.error || "Error al preparar la subida");
              permanent = true;
              break;
            }

            const { signedUrl, publicUrl: pub } = await urlRes.json();
            setProgress(0);
            await uploadWithProgress(
              signedUrl,
              item.file,
              item.file.type,
              (fraction) => setProgress(fraction * 0.9),
            );
            publicUrl = pub;
          } catch (err) {
            // Storage backend rejected the file as too big (413) — permanent
            // and actionable; don't retry.
            if (err instanceof UploadError && err.status === 413) {
              fail(
                "El video pesa demasiado para subirse. Intenta con uno más corto o de menor calidad.",
              );
              permanent = true;
              break;
            }
            // Network drop (status 0) or a transient 5xx — back off and retry.
            if (tryN < MAX_TRIES) {
              setProgress(null);
              await new Promise((r) => setTimeout(r, tryN * 1000));
            } else {
              fail("No se pudo subir el video (conexión inestable). Vuelve a intentar.");
            }
          }
        }

        if (publicUrl === null) continue; // failed — already reported

        // Bytes are stored. Poster is best-effort — never sink the upload for it.
        let thumbnailUrl: string | null = null;
        try {
          const poster = await captureVideoPoster(item.file);
          if (poster) {
            thumbnailUrl = await uploadVideoPosterToStorage(eventId, item.file.name, poster);
          }
        } catch {
          /* poster is optional */
        }
        setProgress(1);

        try {
          const regRes = await fetch(`/api/feed/${eventId}/photos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: publicUrl,
              mimeType: item.file.type,
              thumbnailUrl,
            }),
          });

          if (regRes.ok) {
            const photo = await regRes.json();
            onUploaded?.({ ...photo, userId: photo.userId ?? photo.user?.id });
            succeeded++;
          } else {
            const data = await regRes.json().catch(() => ({}));
            fail(data.error || "Error al registrar el video");
          }
        } catch {
          fail("Se subió el video pero no se pudo publicar. Intenta de nuevo.");
        }
      } else {
        // Image: existing multipart flow (small after compression)
        const processed = await compressImage(item.file);
        const formData = new FormData();
        formData.append("file", processed);

        try {
          const res = await fetch(`/api/feed/${eventId}/photos`, {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const photo = await res.json();
            onUploaded?.({ ...photo, userId: photo.userId ?? photo.user?.id });
            succeeded++;
          } else {
            const data = await res.json().catch(() => ({}));
            fail(data.error || `No se pudo subir la foto (Error ${res.status})`);
          }
        } catch {
          fail("No se pudo conectar al servidor. Revisa tu conexión.");
        }
      }
    }

    setUploading(false);
    setProgress(null);

    if (succeeded > 0) {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPending([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const displayError = validationError || error;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/webm"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label={label ?? "Agregar foto"}
        className={cn(
          "flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
          label
            ? "font-semibold text-accent hover:bg-accent/10"
            : "font-medium text-muted hover:bg-surface",
          uploading && "pointer-events-none opacity-50",
        )}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
        {label && <span>{label}</span>}
      </button>

      {/* Preview overlay */}
      {pending.length > 0 && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-card sm:rounded-2xl">
            {/* Preview */}
            <div className="max-h-[60dvh] overflow-y-auto p-3">
              {pending.length === 1 ? (
                <div className="overflow-hidden rounded-xl bg-surface">
                  {pending[0].isVideo ? (
                    <video
                      src={pending[0].previewUrl}
                      className="w-full rounded-xl"
                      playsInline
                      muted
                      autoPlay
                      loop
                    />
                  ) : (
                    <img
                      src={pending[0].previewUrl}
                      alt=""
                      className="w-full rounded-xl"
                    />
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {pending.map((item, i) => (
                    <div key={i} className="relative overflow-hidden rounded-lg bg-surface">
                      {item.isVideo ? (
                        <video
                          src={item.previewUrl}
                          className="aspect-[3/4] w-full object-cover"
                          playsInline
                          muted
                          autoPlay
                          loop
                        />
                      ) : (
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="aspect-[3/4] w-full object-cover"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Progress bar */}
            {uploading && progress !== null && (
              <div className="mx-3 mb-2 h-1 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}

            {/* Error / validation message */}
            {displayError && (
              <div className="mx-3 mb-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">
                {displayError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 border-t border-border/30 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
              <button
                onClick={cancel}
                disabled={uploading}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-100 text-[14px] font-medium text-foreground/70 transition-colors active:bg-neutral-200"
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
              <button
                onClick={confirm}
                disabled={uploading || !!validationError}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-medium text-white transition-colors active:brightness-90 disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {uploading
                  ? progress !== null
                    ? `Subiendo… ${Math.round(progress * 100)}%`
                    : "Subiendo…"
                  : "Publicar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
