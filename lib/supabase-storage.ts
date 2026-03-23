import { createClient } from "@supabase/supabase-js";

const BUCKET = "media";

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function uploadMedia(
  file: Buffer,
  filename: string,
  contentType: string,
): Promise<{ url: string; thumbnailUrl: string | null } | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }

  const path = `uploads/${Date.now()}-${filename}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false });

  if (error) {
    console.error("Storage upload error:", error);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return { url: publicUrl, thumbnailUrl: null };
}
