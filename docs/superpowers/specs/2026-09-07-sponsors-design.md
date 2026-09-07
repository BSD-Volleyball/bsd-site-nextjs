# Sponsors feature design (2026-09-07)

## Context

Local businesses will pay to sponsor the league for a season. In return they get their logo on the championship t-shirt and a presence on the website. Today nothing in the app models a sponsor, and the only payment flows are season signup and tournament signup.

Design decisions confirmed with the user during brainstorming:

- A reusable `sponsors` business record plus a per-season `sponsorships` row (amount, paid state, payment record), so returning sponsors are renewed without re-entry.
- Admin-initiated: admin picks the contact user (an existing account) and enters the amount. Both admin and the contact user can edit the business details (name, website, blurb, logo).
- Amount only, no tiers. Public ordering is amount desc, then name.
- Admin can also mark a sponsorship paid manually (check/invoice) with a note. Payment method is recorded as `square` or `manual`.
- Public display: a dedicated `/sponsors` marketing page plus a compact logo strip on the homepage. Only **paid** sponsorships for the current season appear publicly.
- Sponsor user pays and edits details on a dedicated `/dashboard/sponsorship` page; the dashboard home shows a summary card linking there.
- Notifications: email to the contact when the sponsorship is created (payment now available), and email to all admins when it is paid (by Square or manually).

Existing patterns to reuse (found during exploration):

| Concern | Reuse |
|---|---|
| Admin CRUD against a user | `src/app/dashboard/manage-discounts/{page.tsx,actions.ts,discounts-manager.tsx}` (uses `UserCombobox`) |
| Square charge | `submitSeasonPayment` in `src/app/dashboard/pay-season/actions.ts` (server-authoritative amount, retried tx, critical-log if charged-but-unrecorded) and `PaymentForm`/`CreditCard` usage in `pay-season/wizard-form.tsx` |
| Image upload | R2 presigned flow in `src/app/dashboard/add-pictures/actions.ts` + `src/lib/r2.ts` (`createPlayerPictureUploadPresignedUrl`, `deleteR2Object`), client compression via `src/lib/image-compression.ts` |
| Dashboard card gate | `getTournamentWaiverGate` in `src/lib/tournament-config.ts` (helper returns `null` or payload) and `src/components/dashboard/tournament-waiver-card.tsx` |
| User email | `dispatchNotification` in `src/lib/notifications/dispatch.ts`, registry in `src/lib/notifications/types.ts`, HTML builders in `src/lib/email-html.ts` |
| Admin email | `sendMail({ mode: { kind: "staff", ... } })` over `getRecipientsWithRole("admin")` (see `notifyAdminsOfTryoutRosterConflict` in `src/lib/availability.ts`) |
| Auth helpers | `requirePermission`, `requireSession`, `requireSeasonConfig`, `withAction`, `ok`, `fail` from `src/lib/action-helpers.ts`; `requirePermissionOrRedirect` from `src/lib/page-guards.ts` |
| Audit | `logAuditEntry` in `src/lib/audit-log.ts` |
| Current season | `getSeasonConfig()` in `src/lib/site-config.ts` (max `seasons.id`) |

This document is the approved design; the implementation followed the order of work below.

---

## 1. Schema and migration

**File:** `src/database/schema.ts` (add after `discounts`), then `DOTENV_CONFIG_PATH=.env.local npx drizzle-kit generate` → `migrations/0019_sponsors.sql`.

```ts
export const sponsors = pgTable("sponsors", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    website: text("website"),
    blurb: text("blurb"),
    logo_path: text("logo_path"),           // "/sponsorlogos/<id>-<slug>.<ext>" like player pics
    contact_user: text("contact_user").notNull()
        .references(() => users.id, { onDelete: "restrict" }),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({ sponsorsContactUserIdx: index("sponsors_contact_user_idx").on(t.contact_user) }))

export const sponsorships = pgTable("sponsorships", {
    id: serial("id").primaryKey(),
    sponsor_id: integer("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "restrict" }),
    season: integer("season").notNull().references(() => seasons.id, { onDelete: "restrict" }),
    amount: numeric("amount").notNull(),
    status: text("status").default("pending").notNull(),   // "pending" | "paid"
    payment_method: text("payment_method"),                 // "square" | "manual"
    order_id: text("order_id"),                             // Square payment id (naming matches signups)
    amount_paid: numeric("amount_paid"),
    receipt_url: text("receipt_url"),
    paid_at: timestamp("paid_at"),
    paid_note: text("paid_note"),
    marked_paid_by: text("marked_paid_by").references(() => users.id, { onDelete: "set null" }),
    created_by: text("created_by").references(() => users.id, { onDelete: "set null" }),
    created_at: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
    sponsorshipsSponsorSeasonUniq: uniqueIndex("sponsorships_sponsor_season_uniq").on(t.sponsor_id, t.season),
    sponsorshipsSeasonIdx: index("sponsorships_season_idx").on(t.season)
}))
```

Add both to `relations` alongside `seasonsRelations`. Apply to prod **before** deploying (AGENTS.md rule; DB defaults are additive here so no expand/contract needed). Per memory, `drizzle-kit migrate` does not work against this DB; apply via `scripts/run-migration.ts` or raw DDL.

## 2. Permission

**File:** `src/lib/permissions.ts`: add `"sponsors:manage"` to the `Permission` union and `ALL_PERMISSIONS` (admin wildcard). No role change needed. Existing tests in `src/lib/permissions.test.ts` loop over the list.

## 3. Shared libraries

- **`src/lib/square.ts`** (new): move `getSquareClient()` here from `pay-season/actions.ts`; update `pay-season/actions.ts` and `tournament-signup/actions.ts` to import it. Existing integration tests mock the `square` module, so they keep working.
- **`src/lib/sponsor-logo.ts`** (new): `SPONSOR_LOGO_OBJECT_PREFIX = "sponsorlogos"`, `getSponsorLogoObjectKey(sponsorId, ext)`, `getSponsorLogoDbPath(...)`, `SPONSOR_LOGO_MAX_BYTES` (2 MB), allowed content types `image/png`, `image/jpeg`, `image/svg+xml`, `image/webp`. Logo URLs are built with `buildPlayerPictureUrl(playerPicBaseUrl(), logo_path)` from `src/lib/utils.ts` (same bucket, same base URL, no `next.config.ts` change).
- **`src/lib/sponsors.ts`** (new, server-only): shared queries.
  - `getPublicSponsors(seasonId)`: paid sponsorships joined to sponsors, ordered `amount desc, name asc`, returns `{ id, name, website, blurb, logoUrl }[]`.
  - `getSponsorshipForUser(userId, seasonId)`: the user's sponsorship for the current season (contact_user match) or `null`. Used by the dashboard card gate and the sponsorship page.
  - `markSponsorshipPaid(tx, { sponsorshipId, method, orderId?, amountPaid, receiptUrl?, note?, markedPaidBy? })`: the single write path for both Square and manual payment; guards `status = 'pending'` in the `where` so a double-submit is a no-op.
  - `notifyAdminsSponsorshipPaid({ sponsorName, amount, method, actorUserId })`: staff-mode `sendMail` to `getRecipientsWithRole("admin")` minus the actor.
- **`src/lib/email-html.ts`**: add `buildSponsorshipPaymentDueHtml({ firstName, sponsorName, amount, seasonLabel, payUrl })` and `buildSponsorshipPaidHtml({ adminFirstName, sponsorName, contactName, amount, method, note? })` using `renderEmailHtml` + `renderDetailsBlock`.
- **`src/lib/notifications/types.ts`**: add `"sponsorship_payment_due"` to `NotificationType` and `NOTIFICATION_TYPES` with `category: null, mandatory: true, stream: STREAM_OUTBOUND`, label "Sponsorship payment requests". The registry invariant test in `types.test.ts` covers it automatically.

## 4. Admin: `/dashboard/manage-sponsors`

**Files:** `src/app/dashboard/manage-sponsors/{page.tsx,actions.ts,sponsors-manager.tsx,actions.integration.test.ts}`.

- `page.tsx`: `await requirePermissionOrRedirect("sponsors:manage")`, load current season via `getSeasonConfig()`, `getSponsorships(seasonId)` + `getSponsorOptions()` + user list (same query `manage-discounts` uses for `UserCombobox`), render `PageHeader` + `SponsorsManager`.
- `actions.ts` (all `withAction`, `requirePermission("sponsors:manage")`, `logAuditEntry` with `entityType: "sponsorships"`/`"sponsors"`, `revalidatePath` for `/dashboard/manage-sponsors`, `/sponsors`, `/`):
  - `getSponsorships(seasonId)` → rows joined with sponsor + contact user name.
  - `createSponsorship({ sponsorId? | newSponsor: { name, website, blurb, contactUserId }, contactUserId, amount, seasonId })`: validates amount > 0 (`requirePositiveInt` style numeric check), inserts sponsor if new, inserts sponsorship, then `dispatchNotification({ type: "sponsorship_payment_due", recipients: [contact], ... payUrl: `${site.url}/dashboard/sponsorship` })`. Returns `ok({ sponsorshipId })`.
  - `updateSponsor(sponsorId, { name, website, blurb, contactUserId })`.
  - `updateSponsorshipAmount(sponsorshipId, amount)`: only while `status = 'pending'`.
  - `markSponsorshipPaidManually(sponsorshipId, { note, amountPaid? })`: `markSponsorshipPaid(..., method: "manual", markedPaidBy: admin)`, then `notifyAdminsSponsorshipPaid`.
  - `deleteSponsorship(sponsorshipId)`: pending only.
  - `createSponsorLogoUpload(sponsorId, contentType, contentLength)` / `finalizeSponsorLogoUpload(sponsorId, key)`: same shape as `createMissingPictureUpload`/`finalizeMissingPictureUpload`; finalize sets `logo_path`, deletes the previous object via `deleteR2Object` if the key changed.
- `sponsors-manager.tsx` (client): table of the season's sponsorships (sponsor, contact, amount, status badge, paid date/method/note), a `Collapsible` create form (radio: existing sponsor via `Select` or new sponsor fields; `UserCombobox` for contact; amount input), row actions: edit sponsor (dialog, includes logo upload with preview, using `compressImageForUpload` only for raster types), edit amount, mark paid (dialog with note), delete (`AlertDialog`). `toast` + `router.refresh()` after each mutation.
- **Sidebar:** add `{ title: "Manage Sponsors", url: "/dashboard/manage-sponsors", icon: RiHandHeartLine }` (or similar Remix icon) to `adminNavItems` in `src/components/layout/sidebar-nav-config.ts`. It sits inside the existing `isAdmin` group in `app-sidebar.tsx`; no new boolean needed since only admins hold `sponsors:manage`.

## 5. Sponsor user: dashboard card + `/dashboard/sponsorship`

- **Card gate:** `getSponsorshipForUser` from `src/lib/sponsors.ts`. In `src/app/dashboard/page.tsx`, fetch it alongside the other gates and render `<SponsorshipCard data={...} />` when non-null.
- **`src/components/dashboard/sponsorship-card.tsx`** (client, modeled on `tournament-waiver-card.tsx`): amber styling while pending ("Sponsorship payment due: $X for <season>", button "Pay & manage details" → `/dashboard/sponsorship`); neutral styling once paid ("Thank you for sponsoring <season>", receipt link if present, button "Manage details").
- **`src/app/dashboard/sponsorship/{page.tsx,actions.ts,sponsorship-view.tsx,actions.integration.test.ts}`**:
  - `page.tsx`: `requireSessionOrRedirect()`, `getSponsorshipForUser`; redirect to `/dashboard` when null. Passes `squareAppId`/`squareLocationId` from env as props (the `tournament-signup` page pattern).
  - `actions.ts`:
    - `updateMySponsorDetails({ name, website, blurb })`: `requireSession`, verify `sponsors.contact_user = session.user.id`, update, audit, revalidate `/sponsors` + `/`.
    - `createMySponsorLogoUpload` / `finalizeMySponsorLogoUpload`: same as admin versions but authorized by contact ownership. Share the internal implementation via a non-exported helper in `src/lib/sponsors.ts` so the two action files don't duplicate it.
    - `submitSponsorshipPayment(sourceId: string)`: `requireSession`; load the user's pending sponsorship (amount from DB); `getSquareClient().payments.create({ idempotencyKey: randomUUID(), sourceId, amountMoney: { currency: "USD", amount: BigInt(cents) }, buyerEmailAddress, note: "<season> Sponsorship - <sponsor name>" })`; then inside `withTransientRetry` + `db.transaction`: `markSponsorshipPaid(tx, { method: "square", orderId: payment.id, amountPaid, receiptUrl })` + `logAuditEntry`; on tx failure log the same `CRITICAL: Square payment succeeded but ...` message with `{ paymentId, userId, sponsorshipId, amount }` and return a "do NOT pay again" message. After commit: `notifyAdminsSponsorshipPaid` and a transactional receipt `sendMail({ mode: { kind: "transactional", category: "sponsorship_receipt" } })` to the payer. Returns `PaymentResult`-shaped `{ status, message, paymentId?, receiptUrl? }`. Lift `withTransientRetry`/`isTransientDbError` out of `pay-season/actions.ts` into `src/lib/db-retry.ts` so it can be shared.
  - `sponsorship-view.tsx` (client): two cards. "Business details" form (name, website, blurb, logo upload with preview). "Payment": while pending, amount summary + `PaymentForm`/`CreditCard` from `react-square-web-payments-sdk` keyed on `resolvedTheme` exactly as `pay-season/wizard-form.tsx` does; on tokenize call `submitSponsorshipPayment(token)`; on success show confirmation with receipt link and `router.refresh()`. When paid, show paid summary instead.

## 6. Public pages

- **`src/app/(marketing)/sponsors/page.tsx`**: async server component, `export const metadata`, `export const revalidate = 3600` (matches the marketing layout). `getSeasonConfig()` → `getPublicSponsors(seasonId)`. Grid of shadcn `Card`s: logo (`next/image`, `unoptimized` for SVG), name, blurb, website link (`rel="noopener noreferrer" target="_blank"`). Empty state: "Interested in sponsoring? Email <site.mailSupport>." Heading includes `formatSeasonLabel(config)`.
- **Navbar:** add `{ title: "Our Sponsors", href: "/sponsors", description: "Businesses supporting the league" }` to `infoPages` in `src/components/layout/navbar.tsx`.
- **Homepage strip:** new `src/components/layout/sections/sponsors-strip.tsx` (server component) rendering a centered row of logos (linked to sponsor website, fallback to `/sponsors`) with heading "Thanks to our <season> sponsors"; returns `null` when the list is empty. Insert into `src/app/(marketing)/page.tsx` near the footer. Sponsor mutations call `revalidatePath("/")` and `revalidatePath("/sponsors")`.

## 7. Tests

- `src/app/dashboard/manage-sponsors/actions.integration.test.ts`: for `createSponsorship`, `markSponsorshipPaidManually`, `updateSponsorshipAmount`, `deleteSponsorship`: unauthenticated → `{ status: false, message: "Unauthorized." }`; `createUserWithRoles([{ role: "captain" }])` → unauthorized; `createUserWithRoles([{ role: "admin" }])` → success, row state, audit row, `revalidatePath` called. Assert `sentBatchMessages()`/`sentSingleMessages()` from `src/test/email.ts` contain the payment-due email to the contact on create and the admin email on manual paid (actor excluded). Use `createSeason` from `src/test/factories.ts`.
- `src/app/dashboard/sponsorship/actions.integration.test.ts`: mock `square` like `pay-season/actions.integration.test.ts`; contact user pays → status `paid`, `order_id` set, admins emailed, receipt emailed; non-contact user → fail; second payment attempt → fail ("already paid"); Square failure → row stays pending; simulate tx failure after charge → critical log path returns the do-not-pay-again message. `updateMySponsorDetails` by non-contact → fail.
- `src/lib/sponsors.integration.test.ts`: `getPublicSponsors` returns only paid, current-season rows in amount-desc order.
- The authz smoke test (`src/test/authz-smoke.integration.test.ts`) requires every `"use server"` file to have a colocated test; both new action files get one.

## 8. Order of work

1. Spec file + commit.
2. Schema + migration; apply to local test template (integration setup rebuilds from `migrations/`).
3. Permission, `src/lib/square.ts`, `src/lib/db-retry.ts` extraction (run existing pay-season/tournament tests to confirm no regression).
4. `src/lib/sponsor-logo.ts`, `src/lib/sponsors.ts`, email builders, notification type (TDD: write `sponsors.integration.test.ts` first).
5. Admin actions + tests, then admin UI + sidebar entry.
6. Sponsor actions + tests, then sponsorship page, dashboard card, page.tsx wiring.
7. Public page, navbar entry, homepage strip.
8. Quality gates and commit/push per repo convention.

## Verification

- `pnpm test:unit` and `pnpm test:integration` (needs local Postgres running; see testing-setup memory).
- `pnpm check-types`, `pnpm check-authz`, and `pnpm lint` last (Biome catches unused imports that tsc misses).
- Manual, on `pnpm dev` at http://localhost:3000 with Square sandbox env vars:
  1. As admin: create a sponsorship for a test user with a logo; confirm the payment-due email in the Postmark mock/log output, and the row appears in Manage Sponsors as pending.
  2. As that user: dashboard shows the amber card; sponsorship page shows details form and Square form; pay with sandbox card `4111 1111 1111 1111`; card flips to paid, receipt link present, admin email fired.
  3. Public: `/sponsors` and the homepage strip show the sponsor only after payment; unpaid sponsors never appear.
  4. As admin: mark a second sponsorship paid manually with a note; confirm admin email and public listing.
- Prod rollout: apply migration `0019` before deploying, per AGENTS.md.
