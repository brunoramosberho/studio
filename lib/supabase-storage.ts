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

export async function uploadMedia(
  file: Buffer,
  filename: string,
  contentType: string,
): Promise<{ url: string; thumbnailUrl: string | null } | null> {
  const supabase = getClient();

  if (!supabase) {
    return uploadLocal(file, filename);
  }

  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }

  const uploadPath = `uploads/${Date.now()}-${filename}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(uploadPath, file, { contentType, upsert: false });

  if (error) {
    console.error("Storage upload error:", error);
    return uploadLocal(file, filename);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(uploadPath);

  return { url: publicUrl, thumbnailUrl: null };
}
