import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import sharp from "sharp";

const BUCKET = "media";
const THUMB_WIDTH = 640;
const THUMB_QUALITY = 70;

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function generateImageThumbnail(
  file: Buffer,
): Promise<Buffer | null> {
  try {
    return await sharp(file)
      .resize(THUMB_WIDTH, undefined, { withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY })
      .toBuffer();
  } catch {
    return null;
  }
}

async function uploadLocal(
  file: Buffer,
  filename: string,
  contentType: string,
): Promise<{ url: string; thumbnailUrl: string | null }> {
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });

  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(dir, safeName);
  await writeFile(filePath, file);

  let thumbnailUrl: string | null = null;
  if (contentType.startsWith("image/")) {
    const thumb = await generateImageThumbnail(file);
    if (thumb) {
      const thumbName = `thumb-${safeName.replace(/\.[^.]+$/, ".jpg")}`;
      await writeFile(path.join(dir, thumbName), thumb);
      thumbnailUrl = `/uploads/${thumbName}`;
    }
  }

  return { url: `/uploads/${safeName}`, thumbnailUrl };
}

const isVercel = !!process.env.VERCEL;

async function uploadToSupabase(
  supabase: ReturnType<typeof getClient> & {},
  filePath: string,
  file: Buffer,
  contentType: string,
): Promise<string | null> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { contentType, upsert: false });
  if (error) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
}

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
    return uploadLocal(file, filename, contentType);
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = Date.now();
  const uploadPath = `uploads/${ts}-${safeName}`;

  const publicUrl = await uploadToSupabase(supabase, uploadPath, file, contentType);

  if (!publicUrl) {
    console.error("Supabase storage upload error for:", uploadPath);
    if (isVercel) {
      throw new Error("Storage upload failed");
    }
    return uploadLocal(file, filename, contentType);
  }

  let thumbnailUrl: string | null = null;
  if (contentType.startsWith("image/")) {
    const thumb = await generateImageThumbnail(file);
    if (thumb) {
      const thumbPath = `uploads/thumb-${ts}-${safeName.replace(/\.[^.]+$/, ".jpg")}`;
      const thumbPublicUrl = await uploadToSupabase(supabase, thumbPath, thumb, "image/jpeg");
      thumbnailUrl = thumbPublicUrl;
    }
  }

  return { url: publicUrl, thumbnailUrl };
}

export async function createSignedUploadUrl(
  filename: string,
): Promise<{ signedUrl: string; path: string; publicUrl: string }> {
  const supabase = getClient();
  if (!supabase) {
    throw new Error("Storage not configured");
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uploadPath = `uploads/${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(uploadPath);

  if (error || !data) {
    throw new Error(
      `Failed to create upload URL: ${error?.message ?? "Unknown error"}`,
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(uploadPath);

  return { signedUrl: data.signedUrl, path: uploadPath, publicUrl };
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
