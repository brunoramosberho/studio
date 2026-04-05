import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const BUCKET = "media";

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function uploadLocal(
  file: Buffer,
  filename: string,
): Promise<{ url: string; thumbnailUrl: string | null }> {
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });

  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(dir, safeName);
  await writeFile(filePath, file);

  return { url: `/uploads/${safeName}`, thumbnailUrl: null };
}

const isVercel = !!process.env.VERCEL;

export async function uploadMedia(
  file: Buffer,
  filename: string,
  contentType: string,
): Promise<{ url: string; thumbnailUrl: string | null }> {
  const supabase = getClient();

  if (!supabase) {
    if (isVercel) {
      throw new Error("Storage not configured: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing");
    }
    return uploadLocal(file, filename);
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uploadPath = `uploads/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(uploadPath, file, { contentType, upsert: false });

  if (error) {
    console.error("Supabase storage upload error:", error.message, error);
    if (isVercel) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
    return uploadLocal(file, filename);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(uploadPath);

  return { url: publicUrl, thumbnailUrl: null };
}

export async function deleteMedia(url: string): Promise<void> {
  const supabase = getClient();
  if (!supabase) {
    if (url.startsWith("/uploads/")) {
      const { unlink } = await import("fs/promises");
      const filePath = path.join(process.cwd(), "public", url);
      await unlink(filePath).catch(() => {});
    }
    return;
  }

  try {
    const prefix = supabase.storage.from(BUCKET).getPublicUrl("").data.publicUrl;
    if (url.startsWith(prefix)) {
      const storagePath = decodeURIComponent(url.slice(prefix.length));
      await supabase.storage.from(BUCKET).remove([storagePath]);
    }
  } catch {
    /* best-effort */
  }
}
