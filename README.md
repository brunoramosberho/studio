This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database migrations

Migrations live in `prisma/migrations/`. The first one was added with the
On-Demand Videos feature; before that, schema was kept in sync with the
database manually.

To apply migrations against a database:

```bash
DATABASE_URL=... DIRECT_URL=... npx prisma migrate deploy
```

When changing `prisma/schema.prisma`, generate a new migration with:

```bash
npx prisma migrate dev --name <descriptive>
```

Then commit the generated SQL file under `prisma/migrations/`.

## On-Demand Videos (Cloudflare Stream)

The on-demand library streams pre-recorded classes via Cloudflare Stream.
Members with an active on-demand subscription (or a class subscription with
`includesOnDemand=true`) get gated access. Anti-piracy is handled via:

1. **Signed URLs** with a 1-hour TTL, minted on each playback request.
2. **IP binding** via the JWT `accessRules` claim.
3. **One stream per member** enforced via `OnDemandStreamSession`, with the
   browser sending heartbeats every 30s.

### Cloudflare account setup

1. Create a Cloudflare account and enable [Stream](https://dash.cloudflare.com/?to=/:account/stream).
2. From **My Profile → API Tokens**, create a token with the
   `Stream:Edit` permission scoped to your account.
3. From **Stream → Settings → Signing keys**, click **Create signing key**
   and copy both the key ID and the PEM-encoded private key.
4. From **Stream → Settings → Webhooks**, register
   `https://<your-tenant-subdomain>.<root-domain>/api/webhooks/cloudflare-stream`
   and copy the signing secret.

### Required environment variables

Add these to `.env` / Vercel:

```
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_STREAM_API_TOKEN=...
CLOUDFLARE_STREAM_SIGNING_KEY_ID=...
CLOUDFLARE_STREAM_SIGNING_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
CLOUDFLARE_STREAM_WEBHOOK_SECRET=...
```

The PEM key can be passed with literal `\n` separators — the code unescapes
them at boot. Store the secret-bearing variables as encrypted env vars in
Vercel.

### Studio setup

1. As an admin, go to **/admin/on-demand → Settings**.
2. Pick the package that grants on-demand access. You can either:
   - Create a new `ON_DEMAND_SUBSCRIPTION` package (the simplest path), or
   - Toggle `includesOnDemand` on any existing `SUBSCRIPTION` (so unlimited
     class members get on-demand for free).
3. Toggle **Enable On-Demand**.
4. Switch to **Library**, click **Upload video** and pick a file. Upload runs
   directly from the browser to Cloudflare Stream via TUS (resumable, no
   bandwidth through Vercel).
5. Once Cloudflare finishes processing, the row flips to `ready` and you can
   publish it.

### Cron

The cron job at `/api/cron/on-demand-cleanup-sessions` runs every 5 minutes
and ends sessions whose last heartbeat is older than 90 seconds. It is
registered in `vercel.json`.
