"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, Loader2, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.80;
const SIZE_THRESHOLD = 2 * 1024 * 1024;

function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return Promise.resolve(file);

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const needsResize = width > MAX_DIMENSION || height > MAX_DIMENSION;
      if (!needsResize && file.size < SIZE_THRESHOLD) {
        resolve(file);
        return;
      }

      if (width > height && width > MAX_DIMENSION) {
        height = Math.round((height / width) * MAX_DIMENSION);
        width = MAX_DIMENSION;
      } else if (height > MAX_DIMENSION) {
        width = Math.round((width / height) * MAX_DIMENSION);
        height = MAX_DIMENSION;
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
        JPEG_QUALITY,
      );
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

interface PendingFile {
  file: File;
  previewUrl: string;
  isVideo: boolean;
}

interface PhotoUploadProps {
  eventId: string;
  onUploaded?: (photo: { id: string; url: string; mimeType: string; userId?: string }) => void;
}

export function PhotoUpload({ eventId, onUploaded }: PhotoUploadProps) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const items: PendingFile[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      isVideo: file.type.startsWith("video/"),
    }));
    setPending(items);
  };

  const cancel = () => {
    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPending([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setUploading(true);
    setError(null);
    let succeeded = 0;

    for (const item of pending) {
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
          setError(data.error || `Error ${res.status}`);
        }
      } catch {
        setError("No se pudo conectar al servidor");
      }
    }

    setUploading(false);

    if (succeeded > 0) {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPending([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface",
          uploading && "pointer-events-none opacity-50",
        )}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
      </button>

      {/* Preview overlay */}
      {pending.length > 0 && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
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

            {/* Error message */}
            {error && (
              <div className="mx-3 mb-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">
                {error}
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
                disabled={uploading}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-medium text-white transition-colors active:brightness-90 disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {uploading ? "Subiendo…" : "Publicar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
