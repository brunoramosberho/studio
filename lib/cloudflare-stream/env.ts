function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export function cloudflareAccountId(): string {
  return required("CLOUDFLARE_ACCOUNT_ID");
}

export function cloudflareStreamApiToken(): string {
  return required("CLOUDFLARE_STREAM_API_TOKEN");
}

export function cloudflareStreamSigningKeyId(): string {
  return required("CLOUDFLARE_STREAM_SIGNING_KEY_ID");
}

export function cloudflareStreamSigningKeyPem(): string {
  const raw = required("CLOUDFLARE_STREAM_SIGNING_KEY_PEM");
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function cloudflareStreamWebhookSecret(): string {
  return required("CLOUDFLARE_STREAM_WEBHOOK_SECRET");
}
