"use client";

import { useState, useRef } from "react";
import { Camera, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.80;
const SIZE_THRESHOLD = 2 * 1024 * 1024; // 2 MB

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

interface PhotoUploadProps {
  eventId: string;
  onUploaded?: (photo: { id: string; url: string; mimeType: string }) => void;
}

export function PhotoUpload({ eventId, onUploaded }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setDone(false);

    for (const file of Array.from(files)) {
      const processed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", processed);

      try {
        const res = await fetch(`/api/feed/${eventId}/photos`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const photo = await res.json();
          onUploaded?.(photo);
        }
      } catch {
        console.error("Upload failed");
      }
    }

    setUploading(false);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
    if (inputRef.current) inputRef.current.value = "";
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
        ) : done ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
      </button>
    </>
  );
}
