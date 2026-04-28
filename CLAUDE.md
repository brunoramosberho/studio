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

## Data model (`prisma/schema.prisma`)

~2.1k lines, ~80 models. Almost everything is tenant-scoped — only `User`, `Account`, `Session`, `VerificationToken`, `PendingLogin`, `Country`, `City`, `LoyaltyLevel`, `FavoriteSong`, and system-wide `Achievement` rows (where `tenantId IS NULL`) are global. Always include `tenantId` in `where` clauses for everything else.

### Tenant + identity

- **`Tenant`** is huge (~80 columns, ~40 relations). It owns branding, Stripe Connect state (`stripeAccountId`), Magic SaaS billing state (`stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `trialEndsAt`, `applicationFeePercent`), studio-hour defaults, schedule visibility, notification toggles, cancellation/no-show policy, tax/TPV fees, and locale/`defaultCountryId`.
- **`Membership`** is the per-(`User`, `Tenant`) join with `role` (`CLIENT`/`COACH`/`FRONT_DESK`/`ADMIN`), `lifecycleStage` (`lead → installed → purchased → booked → attended → member`) plus first-event timestamps, referral linkage (`referralCode`, `referredByMembershipId`), and `pwaInstalledAt`/`lastSeenAt`. Use this for "is X a member of Y?" — `User.role` is deprecated.
- **`User`** is global, with optional `Country`/`City`. `isSuperAdmin` grants access to `admin.*` and auto-promotes the user's membership to `ADMIN`. `gender` is AI-guessed at signup (see `lib/ai/guess-gender.ts`).
- **`StudioSettings`** still exists but is deprecated — branding moved onto `Tenant`. `seed.ts` deletes it for cleanup; do not write to it in new code.

### Studio domain (booking core)

The booking graph: **`Country` → `City` → `Studio` → `Room` → `Class` → `Booking`**. `Class` joins `ClassType` (the discipline/template, with `revenueWeight` and `dropInPriceCents` used by revenue allocation), **`CoachProfile`** (not `User` — coaches have their own profile with optional user link, plus `CoachPayRate` for compensation), and `Room`. Adjacent: `Waitlist`, `ClassNotifyMe` (notify-me when spots open), `BlockedSpot`, `ClassSongRequest` + `ClassPlaylistTrack` (Spotify), `CheckIn`, `CoachAvailabilityBlock` (vacation/training time off, with approval workflow).

`Booking` invariants worth knowing:
- `(classId, spotNumber)` is unique (one booking per spot).
- Guest bookings: `userId` may be null, `guestEmail`/`guestName` set, and a member can bring guests via `parentBookingId` self-relation.
- Revenue snapshot fields (`imputedValueCents`, `classWeightSnapshot`, `sourceEntitlementId`) are written once at recognition time so later edits to `ClassType.revenueWeight`/`dropInPriceCents` don't mutate history.

### Packages, subscriptions, and entitlements

Three overlapping concepts — all three coexist:

- **`Package`** — the SKU. `type` ∈ `OFFER | PACK | SUBSCRIPTION`. Optional `credits`, `validDays`, `country`, `classTypes` filter (via `PackageCreditAllocation` for per-class-type credit splits). `recurringInterval` set for subscription SKUs.
- **`UserPackage`** — a member's purchased pack. `status` ∈ `ACTIVE | PENDING_PAYMENT | PAYMENT_FAILED | REVOKED | DISPUTED`. `revokedReason` tracks chargeback/refund. Per-class-type usage tracked via `UserPackageCreditUsage`.
- **`MemberSubscription`** — a Stripe-backed unlimited subscription. Mirrors Stripe state (`status`, `currentPeriodStart`/`End`, `pausedAt`, `cancelAtPeriodEnd`).
- **`Entitlement`** is the **accounting overlay** added later — it unifies packs, unlimited, drop-ins, and penalties under one stable FK so `RevenueEvent` has a single target. `userPackageId` and `memberSubscriptionId` link back. **`Booking.sourceEntitlementId` is the canonical link** from a consumption to its source.

When working on payments/booking flow, expect to write to `UserPackage` *and* `Entitlement` together. The revenue subsystem reads from `Entitlement`, never from `UserPackage` directly.

### Revenue recognition (ASC 606 / IFRS 15)

Header comment in the schema (around line 2018) is the spec — read it before touching this area. Key invariants:

- Classes never generate revenue directly; revenue comes from packs, unlimited subs, drop-ins, and penalties.
- **`RevenueEvent`** is the single source of truth. Types: `booking`, `daily_accrual` (unlimited pro-rata, excluded from reports), `expiration_breakage`, `monthly_breakage`, `penalty`, `reversal` (reserved). The unique constraint `(entitlementId, eventDate, type)` is the **idempotency guard** — re-running the daily accrual / pack expiration crons is a safe no-op.
- Math lives in `lib/revenue/math.ts` (the only file with tests). Cron entry points: `revenue-accrual-daily`, `revenue-pack-expiration`, `revenue-monthly-close`. Do not bypass them — the math handles unlimited→class allocation with per-`ClassType` weights and a per-booking cap at the drop-in price.

### Payments, debt, and POS

- **`StripePayment`** — every online payment intent (Connect: student → studio). `type` ∈ `subscription | package | product | penalty | class | membership | pos`. Tracks `applicationFee`/`stripeFee`/`netAmount`/`availableOn`.
- **`PosTransaction`** — in-person/manual sales (cash, card, saved card). Same `type` taxonomy as `StripePayment`. `processedById` is the staff member.
- **`StripeCustomer`** — per-(tenant, user) Stripe customer with `defaultPaymentMethodId` for one-tap re-purchase.
- **`PendingPenalty`** — buffer between "this looks like a no-show" and "we charged the fee / consumed the credit." Created by cron or manual NO_SHOW marking; auto-confirmed after `tenant.noShowPenaltyGraceHours`, or resolved manually from `/admin/no-shows`. Snapshots `loseCredit`/`chargeFee`/`feeAmountCents`/`isUnlimited` at creation time so policy changes don't retroactively alter pending items.
- **`Debt`** — outstanding balance from chargebacks/refunds/manual entries. `status` ∈ `OPEN | PAID | FORGIVEN | DISPUTED`. Helpers in `lib/billing/debt.ts`.
- **`DiscountCode`** + **`DiscountRedemption`** — coupons (percent or fixed). Optional Stripe sync via `stripeCouponId`.

### Social, gamification, notifications

- **`FeedEvent`** is the central social timeline. `eventType` ∈ `CLASS_COMPLETED | CLASS_RESERVED | ACHIEVEMENT_UNLOCKED | LEVEL_UP | STUDIO_POST`, `visibility` ∈ `STUDIO_WIDE | FRIENDS_ONLY | PRIVATE`. Has `Like`, `Comment`, `Photo`, `Poll` (with `PollOption`/`PollVote`) attached. Most generated content is mirrored here so the feed has a uniform shape.
- **`Friendship`** is bidirectional with status (`PENDING | ACCEPTED | DECLINED`); always look up via both requester *and* addressee.
- Gamification has three tiers: **`Achievement`** (definitions; `tenantId` nullable = system-wide, `key` globally unique), **`LoyaltyLevel`** (global Bronze→Elite ladder, not per-tenant), and per-member state in **`MemberProgress`** (composite PK on `userId+tenantId`), **`MemberAchievement`** (unlocks), **`MemberReward`** (granted rewards: discount code / free class / custom). Tenant toggles via **`TenantGamificationConfig`** (overrides for level/achievement names + `autoRewards` JSON config). Catalog seeds in `lib/gamification/catalog.ts`.
- **`Notification`** + **`PushSubscription`** drive in-app and web-push notifications. Do not call `web-push` directly — go through `lib/push.ts`.

### External integrations

- **`StudioPlatformConfig`** + **`SchedulePlatformQuota`** + **`PlatformBooking`** + **`PlatformAlert`** — ClassPass / Gympass quota allocation per class and inbound-email parsing of partner reservations (Mailgun → `api/webhooks/email-inbound`). Quota algorithm in `lib/platforms/quota-algorithm.ts`, parser in `lib/platforms/parser.ts`.
- **`InstagramIntegration`** — single per tenant; carries the long-lived IG token.
- **`UserWearableConnection`** + **`ClassBiometrics`** — Strava OAuth (tokens encrypted via `lib/encryption.ts`). Biometrics are unique on `(bookingId, provider)` and `(provider, providerActivityId)`.
- **`Waiver`** + **`WaiverSignature`** — per-tenant liability waiver with versioning. `WaiverSignature.signatureHash` proves integrity; PDFs go to Supabase Storage via `pdfStorageKey`. The `WaiverGate` component blocks the app for unsigned members per tenant trigger flags.

### Marketing, analytics, conversion

- **`MembershipConversionConfig`** + **`NudgeEvent`** + **`IntroOfferClaim`** drive the nudge engine in `lib/conversion/nudge-engine.ts` (booking-flow upsell, intro offer with timer, savings emails, package upgrade, post-class nudges). Cap is `maxNudgesPerMemberPerWeek`.
- **`TenantAnalyticsConfig`** — per-tenant GA4 / Meta Pixel / GTM credentials with per-event toggles. Used by `lib/analytics/`.
- **`LinkClick`** + **`LinkConversion`** — UTM-tagged link tracking (`lib/marketing/links.ts`).
- **`ReferralConfig`** + **`ReferralReward`** — referrer/referee dual-reward system, triggered at `triggerStage` of the referee's lifecycle (`lib/referrals/`).
- **`Highlight`** + **`HighlightClick`** — feed banners (only rendered when `tenant.highlightsEnabled`).
- **`SparkFeatureRequest`** — admin-submitted feature requests captured by the in-app AI assistant.

### Common modelling patterns

- **Soft-state via enums + `isActive`**: most "deletable" entities use `isActive: Boolean` plus a status enum rather than hard deletes. Don't `prisma.x.delete()` without checking — usually you want to flip a flag.
- **Nullable `tenantId` = system-wide**: `Achievement.tenantId` is the main example. `LoyaltyLevel` has no `tenantId` column at all (always global).
- **Singleton-per-tenant configs**: `MembershipConversionConfig`, `TenantAnalyticsConfig`, `ReferralConfig`, `TenantGamificationConfig`, `InstagramIntegration` all use `tenantId @unique`. Use `upsert`, not `create`.
- **Money**: revenue/accounting uses integer cents (`*Cents` columns + `Decimal(4,2)` for weights). Older money columns (`Package.price`, `StripePayment.amount`, etc.) use `Float` — be careful when mixing the two; never sum across types.
- **Idempotency**: the only DB-level idempotency guard is `RevenueEvent.uniq_entitlement_date_type`. Webhook handlers and crons should rely on it rather than checking-then-writing.

### When changing the schema

`vercel.json` runs `npx prisma generate && next build`, but **migrations are not auto-applied** by the build. Run `npx prisma migrate dev --name <descriptive>` locally; commit the generated SQL in `prisma/migrations/` (not present in the repo today, so the first migration you add establishes the convention). For destructive changes, also update `prisma/seed.ts`'s deletion order — the seed walks tables in foreign-key order and will break if you add a new dependency without slotting it in.

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
