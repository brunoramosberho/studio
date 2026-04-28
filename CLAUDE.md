# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Next.js 16 (App Router) on React 19, TypeScript strict, Tailwind v4, Prisma 6 against PostgreSQL (Supabase). Auth via NextAuth v5 beta. i18n via `next-intl` (en/es). Client state via Zustand + TanStack Query. Payments via Stripe (incl. Connect). AI assistant via `@anthropic-ai/sdk`. Tests with Vitest. Path alias `@/*` → repo root.

## Commands

```bash
npm run dev            # webpack dev server (next dev --webpack)
npm run dev:clean      # clear .next/.turbo/cache then dev
npm run build          # next build (Vercel runs `npx prisma generate && next build`)
npm run lint           # eslint (flat config, eslint-config-next)
npm run test           # vitest run — only lib/**/*.test.ts is picked up
npm run test:watch
npm run seed           # prisma/seed.ts — destructive: wipes & reseeds the dev tenant
npm run seed:shop      # additive: products only
npm run seed:camila    # additive: extra user + past classes (no tenant changes)
npm run backfill:revenue   # scripts/backfill-entitlements.ts

# Prisma (no script wrappers — call directly)
npx prisma generate
npx prisma migrate dev --name <name>
npx prisma studio

# Single test file
npx vitest run lib/revenue/math.test.ts
```

`prisma/seed.ts` deletes data in foreign-key order before reseeding — never run it against a tenant you care about. Branding/seed behaviour is driven by `SEED_*` env vars (see `.env.example`); without them you get a Be Toro-flavoured default tenant. One-off scripts live in `scripts/` and are run with `npx tsx <path>`.

## Multi-tenancy and routing (read this before changing middleware, auth, or any API route)

The app is a single Next.js deployment serving many studios via subdomain. `middleware.ts` is the source of truth for which surface a request lands on.

- `<slug>.mgic.app` → tenant. Middleware sets `x-tenant-slug=<slug>` and `x-auth-portal=admin|client` based on path.
- `admin.mgic.app` → super admin. Middleware sets `x-tenant-slug=__super_admin__` and rewrites `/foo` → `/super-admin/foo`.
- Apex (`mgic.app`) → marketing landing. `/` rewrites to `/directory`. Tenant-only paths (`/login`, `/my`, `/admin`, `/coach`, `/schedule`, `/book`, `/class/`, `/packages`, `/shop`, `/rate`, `/waiver`, `/install`) redirect to `/`.
- `/admin/*` and `/coach/*` are gated by an admin-portal cookie; `/my/*` by a client-portal cookie. API routes are not gated in middleware — each route enforces its own auth.

Local dev uses subdomains too (`betoro.localhost:3000`, etc., listed in `next.config.ts > allowedDevOrigins`). Hitting `localhost:3000` directly puts you on the apex.

### Two NextAuth instances

`lib/auth.ts` exports two parallel NextAuth setups that share providers (Google, Resend magic link, Dev Credentials) and the Prisma adapter, but use **different cookie names and base paths**:

- Client (`/my`, public): `auth()`, `signIn()`, handlers at `/api/auth/*`, cookie `authjs.session-token` (or `__Secure-` in prod).
- Admin (`/admin`, `/coach`): `adminAuth()`, `adminSignIn()`, handlers at `/api/auth-admin/*`, cookie suffix `.admin`.

A user can be signed in to both portals on the same domain simultaneously. There is also a `SUPER_SESSION_COOKIE` for the super-admin subdomain, validated directly against `prisma.session` in `requireSuperAdmin()` — not via NextAuth.

Magic-link emails are sent through Resend with branding pulled from the tenant (see the `sendVerificationRequest` override). The link's host is rewritten to the request host so cross-subdomain magic links work.

### Auth + tenant resolution

`lib/tenant.ts` is the canonical helper layer. **Use these instead of reading headers/cookies directly.**

- `getTenantSlug()`, `getTenant()`, `requireTenant()` — read the `x-tenant-slug` header set by middleware (cached per request via `react.cache`).
- `getTenantCurrency()` — resolves currency/symbol/Intl locale from the tenant's `defaultCountry`. Falls back to EUR/es-ES (display only — never use the fallback for billing).
- `getAuthContext()` / `requireAuth()` / `requireRole(...roles)` — return `{ session, tenant, membership }`. They also auto-create a CLIENT membership on first request (or upgrade a super-admin's membership to ADMIN) and throttle a `lastSeenAt` write to once per hour.
- `requireSuperAdmin()` — only on `admin.*` (validates `SUPER_SESSION_COOKIE` against the DB).

Roles (`Role` enum): `CLIENT < COACH < FRONT_DESK < ADMIN`. Check with `roleAtLeast(...)`. Admin nav/API permissions are a separate layer — see `lib/permissions.ts` (`AdminPermission` granular flags; FRONT_DESK gets only the operational subset).

### Tenant-scoping rule

Every Prisma query for tenant-owned data **must** filter by `tenantId` (or scope through a relation that does). Top-level models like `User`, `Account`, `Session`, `City`, `Country` are global; almost everything else is tenant-scoped. Cross-tenant data leaks are the most dangerous bug class in this codebase.

## App layout

```
app/
  (auth)/login/                 # shared login page; ?portal=admin switches portals
  (public)/                     # schedule, book, class/, packages, shop, instructors, dev, terms, privacy
  admin/                        # owner / front-desk panel (admin cookie required)
  coach/                        # instructor portal (admin cookie required)
  my/                           # member portal (client cookie required)
  super-admin/                  # served on admin.* via middleware rewrite
  directory/                    # apex landing (rewritten from /)
  embed/                        # iframe-friendly widget (next.config.ts sets frame-ancestors *)
  api/                          # see below
```

`app/api/` is large; some sub-trees with non-obvious contracts:

- `api/cron/*` — invoked by Vercel cron (schedules in `vercel.json`): `class-reminders` (every 5min), `revenue-accrual-daily`, `revenue-pack-expiration`, `revenue-monthly-close`, `no-show-auto-confirm` (all hourly).
- `api/webhooks/*` — `stripe`, `stripe-connect`, `strava`, `email-inbound` (Mailgun, signed with `MAILGUN_WEBHOOK_SIGNING_KEY`).
- `api/stripe/*` — Stripe Connect onboarding, payment intents, setup intents, billing portal, member subscriptions. Helpers in `lib/stripe/`.
- `api/auth/*` and `api/auth-admin/*` — NextAuth handlers for the two portals (see above).
- `api/manifest`, `api/icon`, `api/pwa/*` — per-tenant PWA manifest + icons (manifest takes a `?portal=my|admin|coach` param).

## Domain layer (`lib/`)

`lib/` is organised by domain, not by technical layer. Cross-cutting infra:

- `db.ts` — Prisma singleton. Always import `prisma` from here.
- `auth.ts`, `tenant.ts`, `permissions.ts` — see above.
- `branding.ts` / `branding.server.ts` — tenant theming. The `Tenant` row owns colours/fonts/logo; `getServerBranding()` reads from request-scoped tenant, `getBrandingForTenantId()` reads explicitly (use this in cron / webhooks where there is no tenant header).
- `currency.ts` — `formatMoney(amount, tenantCurrency)` is preferred over the legacy `formatCurrency()` in `utils.ts`.
- `stripe/` (and `stripe.ts`), `revenue/`, `billing/`, `email.ts`, `push.ts`, `encryption.ts`, `supabase-storage.ts`.

Domain modules with their own subfolder usually expose a barrel `index.ts`: `revenue/`, `stripe/`, `gamification/`, `referrals/`, `platforms/` (ClassPass / Gympass quota + parsing), `waiver/`, `pwa/`, `ratings/`, `onboarding/` (tenant scrape + structure generator), `conversion/`, `analytics/`, `marketing/`, `ai/`. The AI assistant lives in `lib/ai/` (system prompt + tool definitions/executor) plus the legacy `lib/claude.ts` streaming helper.

`hooks/` holds the public-facing TanStack Query hooks (`useBooking`, `useSchedule`, `usePackages`, `usePolicies`, `useAssistant`). `store/` holds Zustand stores (`booking-store`, `pos-store`, `schedule-store`).

## Front-end conventions

- Root layout (`app/layout.tsx`) loads ten Google fonts as CSS variables and picks a pair via `getFontPairing(b.fontPairing)`. Tenant-customisable colours are injected as inline CSS variables on `<html>`; **light/dark neutrals live in `app/globals.css`** so `html.dark` can override cleanly. A no-flash inline script applies the theme before paint.
- Apex requests render *without* the PWA install prompt, mobile member nav, waiver gate, rating sheet, or Apple splash — these are tenant-only surfaces. The check is `!tenantSlug` against the middleware header.
- `Providers` (`app/providers.tsx`) wraps children with `SessionProvider`, `QueryClientProvider` (60s `staleTime`, no refetch on focus), `ThemeProvider`, `BrandingProvider`, `TenantProvider`, and a Sonner `Toaster`.
- `components/ui/` is a hand-rolled shadcn-style primitive set (Radix + `class-variance-authority` + `cn()` from `lib/utils.ts`). Reuse these instead of pulling in new UI libs.
- i18n is server-resolved in `i18n/request.ts`: cookie `NEXT_LOCALE` → `tenant.locale` → `Accept-Language` → `es`. Messages live in `messages/{en,es}.json`.

## Schema & data model notes

`prisma/schema.prisma` is ~2.1k lines. Some non-obvious things worth knowing before editing:

- `Tenant` carries branding, Stripe Connect/SaaS state, policy flags (cancellation window, no-show penalty config), and notification toggles. There is no separate `StudioSettings` table anymore — `seed.ts` still references one for cleanup but the live config is on `Tenant`.
- `Membership` is the per-tenant join. Carries `role`, `lifecycleStage` (lead → installed → purchased → booked → attended → member), referral linkage, and `pwaInstalledAt`. Most "is this user X for this studio?" checks should go through Membership, not the deprecated `User.role`.
- Revenue: `RevenueEvent`, `Entitlement`, `UserPackage`, `MemberSubscription`, `PendingPenalty`, `Debt`. The math/allocation logic for proportional revenue from unlimited subs is in `lib/revenue/math.ts` (the only file with unit tests today).
- Stripe state is split: `stripeAccountId` on `Tenant` (Connect — receives student payments), `stripeCustomerId` + `stripeSubscriptionId` on `Tenant` (the SaaS billing relationship with Magic itself), and `StripeCustomer` / `StripePayment` / `MemberSubscription` rows for member payments.
- Cancellation/no-show penalties have per-segment flags (`noShowLoseCredit`, `noShowChargeFee`, `noShowFeeAmountUnlimited`) and a grace window auto-confirmed by the `no-show-auto-confirm` cron.

## Tests

Only `lib/revenue/math.test.ts` exists today. Vitest config: `environment: node`, includes `lib/**/*.test.ts` only. There are no React component tests and no Playwright/E2E setup. When adding tests, colocate as `<file>.test.ts` next to the unit under test inside `lib/`.

## External services & env vars

See `.env.example` for the full list. Categories: Supabase (`DATABASE_URL`, `DIRECT_URL`), NextAuth (Google, secret), Resend, Stripe (regular + Connect + webhooks), Anthropic, Spotify, Strava, Mailgun (inbound parsing), super-admin credentials, optional dev-login overrides, and `SEED_*` for the seeder. `NEXT_PUBLIC_ROOT_DOMAIN` drives subdomain detection in middleware and cookie scoping in auth — keep it in sync with where you're hosting.

## Conventions worth preserving

- Don't bypass `lib/tenant.ts`; don't read the `x-tenant-slug` header directly.
- Don't introduce a third NextAuth instance — extend the existing two via `makeCookies(suffix)` + `basePath`.
- For new admin sections, add an `AdminPermission` in `lib/permissions.ts` and gate both the nav item and the API route with it.
- For new cron jobs, register the path + schedule in `vercel.json` (Vercel ignores ad-hoc cron files).
- For currency, prefer `formatMoney(amount, await getTenantCurrency())` over hardcoded EUR/MXN. The legacy `formatCurrency` in `lib/utils.ts` is being phased out.
- For tenant-scoped Supabase Storage uploads, route through `lib/supabase-storage.ts` so the path is namespaced by tenant.
