# AGENTS.md

Guidance for coding agents working in this repository.

## Project Summary

- App: BSD Volleyball League management platform (Next.js App Router).
- Scope: player onboarding, season signup/payment, drafting, rosters, scheduling, playoffs, admin tooling.
- Primary stack: Next.js 16, React 19, TypeScript, PostgreSQL, Drizzle ORM, better-auth, shadcn/ui, Tailwind CSS v4, Biome.

## Package Manager

This project uses **pnpm** exclusively. Never use `npm install` or `npm add` — doing so will create a `package-lock.json` and bypass pnpm's strict dependency resolution. Always use `pnpm add <pkg>` to install new packages.

## Working Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm check-types
pnpm check-authz
pnpm test              # unit + integration (Vitest)
pnpm test:unit         # pure logic, no database
pnpm test:integration  # real server actions against local Postgres
pnpm test:e2e          # Playwright end-to-end (local only)
```

Database and auth schema workflows:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
npx @better-auth/cli generate
```

> **Environment note:** Database credentials and all other secrets live in **`.env.local`** (not `.env`). `drizzle.config.ts` uses `import "dotenv/config"` which reads `.env` by default. Prefix Drizzle commands with `DOTENV_CONFIG_PATH=.env.local` so they pick up the correct credentials:
>
> ```bash
> DOTENV_CONFIG_PATH=.env.local npx drizzle-kit generate
> ```
>
> The database uses **Prisma Accelerate** (`db.prisma.io`), which is incompatible with `drizzle-kit migrate`. Always apply migrations via the custom script instead:
>
> ```bash
> DOTENV_CONFIG_PATH=.env.local npx tsx scripts/run-migration.ts
> ```
>
> One-off scripts under `scripts/` also use `import "dotenv/config"`. Run them with the same prefix:
>
> ```bash
> DOTENV_CONFIG_PATH=.env.local npx tsx scripts/my-script.ts
> ```

## Repository Map

- `src/app/`: Next.js routes (App Router).
- `src/app/(marketing)/`: public-facing pages.
- `src/app/dashboard/`: authenticated app area (includes admin tools).
- `src/app/onboarding/`: post-signup onboarding flow.
- `src/app/**/actions.ts`: server actions used by route segments.
- `src/components/ui/`: shadcn/ui components.
- `src/components/layout/`: app layout and navigation components.
- `src/database/schema.ts`: Drizzle schema source of truth.
- `src/database/db.ts`: database client.
- `src/lib/`: framework-independent business logic, auth instance, site config, shared utilities. Must not import `next/*`, `@/next/*`, `@/app/*`, or `@/components/*` (lint-enforced; see Layering).
- `src/next/`: Next.js request glue: `session.ts` (session lookup + `*BySession` wrappers), `action-helpers.ts` (server action guards), `page-guards.ts` (redirecting page guards).
- `migrations/`: SQL migrations generated/applied by Drizzle.
- `scripts/`: one-off maintenance/import scripts.

## Architecture and Coding Patterns

- Prefer App Router server components for data loading.
- Co-locate mutations in `actions.ts` with `"use server"`.
- Client forms/components generally use controlled state (`useState`) and call server actions.
- After successful mutations, call `router.refresh()` in client components to resync server-rendered data.
- Keep auth and RBAC checks explicit in actions/components.
- Prefer centralized authorization helpers in `src/lib/rbac.ts` instead of duplicating role checks in each file.
- **Server action helpers**: Use `requireSession()`, `requireAdmin()`, `requirePermission()`, `requireCaptainAccess()`, `requireSeasonConfig()`, and `withAction()` from `src/next/action-helpers.ts` to reduce boilerplate. Return `ok(data)` / `fail(message)` for consistent `ActionResult<T>` response shapes (`ok(undefined, message)` for message-only mutations). `ActionResult`, `ok`, `fail`, `ActionError`, `withAction`, and the `require*` input validators are defined in `src/lib/action-result.ts` (framework-free) and re-exported by `action-helpers.ts`; lib code and client components import them from `action-result` directly.
- **Page guards**: In server `page.tsx` files, use `requireSessionOrRedirect()`, `requireAdminOrRedirect()`, `requireCaptainAccessOrRedirect()`, or `requirePermissionOrRedirect()` from `src/next/page-guards.ts` instead of hand-rolling the session-fetch + role-check + redirect stanza.
- **Shared utilities**: Use `formatPlayerName()`, `buildPlayerPictureUrl()`, `serializeCsvField()`, `splitByGender()` from `src/lib/utils.ts` instead of defining local copies.
- **Shared components**: Use `UserCombobox` from `src/components/user-combobox.tsx` instead of local copies.
- Use `auth.api.getSession({ headers: await headers() })` directly only when session data is needed for action payloads/logging.
- Authorization uses a permission-based system: roles are stored in the `user_roles` table and permissions are defined in `src/lib/permissions.ts`. Use `hasPermissionBySession(permission)` (from `src/next/session.ts`) in actions/pages, or `hasPermission(userId, permission, context?)` (from `src/lib/rbac.ts`) when the user id is already in hand or the code lives in lib.
- Backward-compatible helpers (`isAdminOrDirectorBySession`, `isCommissionerBySession`, `hasCaptainPagesAccessBySession`) remain available and route through the new system.
- To add a new role: add it to the `Role` type and `ROLE_PERMISSIONS` map in `src/lib/permissions.ts`. No server action changes needed.
- Assign/revoke roles via the admin UI at `/dashboard/manage-roles/` or programmatically via `grantRole()`/`revokeRole()` from `src/lib/rbac.ts`.
- Administrative mutations should log audit entries through `logAuditEntry` when appropriate.

## Layering

- `src/lib`, `src/database`, and `src/config` are framework-independent: they may use React (`cache()`), Drizzle, and npm packages, but never `next/*`, `@/next/*`, `@/app/*`, or `@/components/*`. A Biome `noRestrictedImports` override in `biome.json` enforces this (tests are exempt).
- Lib functions that need to know who is acting take a `userId` parameter and keep their own authorization check (for example `isAdminOrDirector(userId)`); the route handler or server action resolves the session via `src/next/session.ts` and passes the id down.
- Lib code that builds HTTP responses returns web-standard `Response`, not `NextResponse`.
- `src/database/db.ts` exports a lazy Proxy: the pg Pool is created on first query, so importing `db` has no side effects.
- Known remaining framework ties inside lib, deliberately left for a later pass: `import "server-only"` markers (protect client bundles today; Vitest stubs them) and React `cache()` for per-request memoization in `rbac.ts`, `site-config.ts`, `tournament-config.ts`, `player-elo-data.ts`.
- Purpose: a future move to another framework or host should only need to rewrite `src/app`, `src/components`, and `src/next`.

## Security Patterns

- Every exported server action must enforce authorization at the action boundary, even if the route/page is already protected.
- For season-bound actions, validate incoming `seasonId` (positive integer) before querying.
- Commissioner division-scoping is configurable: a commissioner row with `division_id = NULL` in `user_roles` has league-wide access; a row with a specific `division_id` is restricted to that division. Pass `{ seasonId, divisionId }` context to `hasPermission()` to enforce division-level checks.
- Role updates that change privilege should invalidate active sessions for the affected user (call `invalidateAllSessionsForUser`).
- Roles are stored in the `user_roles` table, which is the sole authority for all role checks. The legacy `users.role` column has been removed from the schema.
- Baseline HTTP security headers are configured in `next.config.ts` (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`).

## Database Conventions

- Use Drizzle query builders (`eq`, `and`, `inArray`, `desc`, etc.) and typed selects.
- Keep DB column naming conventions intact (snake_case in schema mappings).
- Preserve existing legacy spellings/table names unless explicitly migrating them.
  - ~~`users.preffered_name`~~ → migrated to `users.preferred_name`
  - ~~`matchs` table~~ → migrated to `matches` table
- The `user_roles` table is the authoritative source for role assignments. Schema: `(id, user_id, role, season_id, division_id, granted_by, granted_at)`. `season_id = NULL` means a global/permanent role; `division_id = NULL` means league-wide for that season.
- **Default conversions are breaking**: moving a column default from app-side (`$defaultFn`) to DB-side (`.default()`/`.defaultNow()`) changes generated inserts to emit `DEFAULT` — code deployed before the migration runs will violate NOT NULL constraints (this stranded three paid signups on 2026-07-27). Apply the migration to prod BEFORE deploying such schema.ts changes, or make the change expand–contract.
- For schema changes:
  1. Update `src/database/schema.ts`.
  2. Generate migration with `npx drizzle-kit generate`.
  3. Apply with `npx drizzle-kit migrate`.

## UI and Styling Conventions

- Reuse components from `src/components/ui/` and layout primitives from `src/components/layout/`.
- Use Tailwind utility classes; prefer `cn()` when conditionally combining classes.
- Maintain existing UX patterns in dashboard tables/forms (status messages, loading state, empty states).

## Consolidated User Details Pop-up Pattern

- Shared state/fetch orchestration lives in `src/components/player-detail/use-player-detail-modal.ts` via `usePlayerDetailModal()`.
- Trigger the pop-up by calling `openPlayerDetail(userId)` from list/table rows and close with `closePlayerDetail()`.
- Non-admin views should use `PlayerDetailPopup` (`src/components/player-detail/player-detail-popup.tsx`) for player-facing fields, pair request context, ratings, and division history.
- Admin views should use `AdminPlayerDetailPopup` (`src/components/player-detail/admin-player-detail-popup.tsx`) for expanded account/contact data, signup history, and draft history in addition to ratings.
- Use the default modal overlay pattern for list/table contexts (for example signups/captains), and `inline` rendering only when details need to be embedded into an existing page flow (for example player lookup).
- Keep the data contract centralized through the hook output (`playerDetails`, `draftHistory`, `signupHistory`, `pairPickName`, `pairReason`, ratings and notes) instead of duplicating local fetch/state logic.

## Formatting and Quality Gates

- Biome is the formatter/linter (`biome.json`):
  - 4-space indentation
  - no semicolons
  - no trailing commas
- Run before finalizing substantial changes:
  - `pnpm lint`
  - `pnpm check-types`

## Testing

- **Unit** (`*.test.ts`): pure logic; the db singleton is aliased to a guard that throws, so unit tests never touch a database.
- **Integration** (`*.integration.test.ts`, colocated): run the real server action against a per-worker clone of a migrated Postgres template. `better-auth` is mocked so `auth.api.getSession()` returns the session set by `loginAs()`, but **role checks stay real** (they query the `user_roles` rows the helpers insert).
- **Admin-gated actions:** open the test with `createUserWithRoles([{ role: "admin" }])` from `src/test/session.ts` — it creates a user, inserts the role rows, and logs the fabricated session in as that admin, so `requireAdmin()`/`requirePermission()` pass genuinely. Cover the negative cases with `createUserWithRoles([{ role: "captain" }])` (authenticated non-admin) and no login at all (unauthenticated); both should return `{ status: false, message: "Unauthorized." }`. See `src/app/dashboard/tournament-pools/actions.integration.test.ts` for a full example (admin loads/saves/reverts the playoff bracket editor).
- **E2E** (`e2e/*.spec.ts`, Playwright, local-only): `e2e/setup/auth.setup.ts` seeds the `bsd_e2e` database and creates **email/password personas** — `admin`, `captain`, `player` (`e2e/helpers.ts`) — via the real signup endpoint, saving each one's storage state. Admin accounts sign in with email/password (not only Google OAuth), so an admin-only flow runs pre-authenticated via `test.use({ storageState: PERSONAS.admin.storageState })`.

## Environment Notes

Common environment variables used across the app include:

- `DATABASE_URL`
- `BETTER_AUTH_BASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_WEBHOOK_USER`
- `POSTMARK_WEBHOOK_PASSWORD`
- `NOTIFICATION_UNSUB_SECRET` (HMAC key for RFC-8058 one-click unsubscribe tokens)
- `CRON_SECRET` (bearer token protecting `/api/cron/*` routes; set automatically by Vercel Cron)
- `MAIL_FROM`
- `NEXT_PUBLIC_APP_URL`
- `PLAYER_PIC_URL`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (Cloudflare R2 via the S3 API: player pictures, inbound email attachments, the inbound-email spool)
- `INBOUND_CONCERN_ADDRESS` (inbound mail to this address becomes a concern instead of an admin email ticket)
- `AI_GATEWAY_API_KEY` (reading handwritten scores off photographed sheets, through Vercel AI Gateway). Optional overrides: `SCORESHEET_MODEL` (a Gateway slug from `https://ai-gateway.vercel.sh/v1/models`, default `google/gemini-3-flash`), `SCORESHEET_MODEL_API_KEY` and `SCORESHEET_MODEL_BASE_URL` for pointing at a different OpenAI-compatible endpoint. With no key the reader still identifies the sheet and counts the WIN ticks, so local dev, CI and e2e need nothing set
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT`
- `NEXT_PUBLIC_SQUARE_APP_ID`
- `NEXT_PUBLIC_SQUARE_LOCATION_ID`

## Surveys

- Templates hold questions (`survey_templates`/`survey_questions`); each sent survey is an instance (`surveys`) with a snapshotted audience (`survey_recipients`) and a frozen `question_ids` list. Pure logic lives in `src/lib/surveys/` (question-type registry, branching evaluator, submission validator, lock rules, reporting math) and is shared by the admin preview, the respondent form, and the server validator — never fork it.
- Once a question has answers its type/options lock (`template-rules.ts`): options may be appended or relabeled, never removed or re-keyed. Trends match on question id across instances of one template.
- Anonymous surveys sever `user_id`/`recipient_id` on submit and coarsen timestamps to the league day (`league-day.ts`); anonymous responses are single-submit. Results suppress segments under 5 responses and the anonymous CSV drops identifying columns.
- Emails go through `dispatchNotification` with dedupe keys `survey-<id>-invite` / `survey-<id>-reminder-<n>`; reminders and auto-close run from `/api/cron/survey-reminders` (daily, `CRON_SECRET`). Permissions: `surveys:manage`, `surveys:view_results` (admin only today).
- `mergeUserRecords` repoints survey rows; keep it in sync if survey tables gain user references.

## Coverage (admin gym presence)

- `/dashboard/coverage` shows every upcoming regular-season and playoff night with one row per time slot (the distinct match start times that night) and the admins in each: derived from `getScheduleForUsers()` for the `admin` and `leadership_group` pools (play / playoff work / ref items) plus coach items derived in `load.ts` (coach = captain or captain2 of a team in a `coaches = true` division; the schedule engine emits nothing for coaches) plus manual rows in `coverage_presence` keyed by `(user_id, event_date, slot_time)`. `admin` role holders always count; `leadership_group` members count only for slots where they were added present manually (they do not count merely for playing/reffing/coaching); anyone with a `user_unavailability` row for the night is shown struck through and does not count — unless they were added present manually, which overrides unavailability (unable to play, still able to cover) and shows them in their covering colour.
- Person chips (page and digest email) share one `personTone()` classifier (`src/lib/coverage/format.ts`) mapping `{counts, isLeadership, unavailable}` to `admin | admin_unavailable | leadership | leadership_covering | other`, so the colour scheme stays in sync between the two surfaces; each renders its own legend from the same five tones.
- Status is one pure function, `computeStatus()` in `src/lib/coverage/status.ts`: red if the first or last timed slot has no counting admin, yellow for a middle gap, green otherwise. The TBD slot (null match time) never affects status. `buildCoverage()` (pure) and `loadCoverage()` (server) live beside it.
- A presence row whose (date, time) no longer matches a slot is an orphan; the page lists it with a remove button rather than dropping it, including on a night whose matches were all removed (`matchCount: 0`, empty `slots`). The one exception: a presence row whose date has no season event at all is not shown — it cannot be created through the page, and only an event deletion leaves one behind. `mergeUserRecords` repoints `coverage_presence`.
- Slot jobs: `TASK_GROUPS` in `src/lib/coverage/tasks.ts` is the one source of the gym task text (Setup / Mid-way / Cleanup), with conditional lines labelled by `TaskCondition` (`regular_season`, `playoff`, `last_regular_week`, `playoffs_next_week`), the latter two derived from `CoverageDate.nextEventType`. The page renders the full labelled list once in a "Gym jobs" card above the weekly cards; each slot then shows only a one-line "Setup — names" summary via `slotTaskKeys()`. The digest (one night) renders `slotTaskGroups()`, the resolved lines, under each slot. Setup = first timed slot, Cleanup = last, Mid-way = the timed slot just before the last (two slots: first gets setup + mid-way; one slot: all three; TBD slot: none). `slotAssigneeNames(slot)` = the people who count in that slot, shown as who the jobs fall to.
- Digest: `coverage_digest` is a mandatory notification type; `sendCoverageDigestForDate(date)` dispatches once per night with dedupe key `coverage-<date>`, so a re-run of the daily cron (`/api/cron/coverage-digest`, 15:00 UTC, for tomorrow) is a no-op. Recipients are all `admin` role holders plus any `leadership_group` member who counts in at least one slot that night (added present); leadership members who only play/ref/coach are not mailed. There is deliberately no manual "send now" button.

## Score Sheets (printable, per court)

- One PDF per match night, one letter page per court, generated on demand: `src/lib/scoresheets/`. Downloaded from a per-night button on `/dashboard/coverage` via `src/app/dashboard/coverage/score-sheets/[date]/route.ts`, and attached to the day-before coverage digest by `sendCoverageDigestForDate`. Nothing is stored; the PDF is rebuilt each time.
- **`layout.ts` is the single source of truth for the printed geometry.** `buildSheetGeometry()` returns every rectangle in PDF points; `render.ts` draws only from it, and the future photo-reading pipeline is meant to import the same function rather than re-deriving coordinates. Do not hardcode a coordinate in `render.ts`.
- **Two codes per page, with different jobs.** The large stylized QR (`public/score-sheet-qr.png`, a fixed asset embedded once per document) encodes `http://bsdvb.us/s`, which redirects to `/dashboard/enter-scores`. It is deliberately generic and identical on every sheet, because one person collects the night's paperwork and works through it on one page. Identity therefore lives in the *second*, smaller QR in the bottom-right corner, squared off against the ref-notes box: `sheetTag()`, e.g. `BSD1:F26:W3:2026-10-05:4` (template version, season, week, date, court), with the human-readable `sheetCode()` printed beneath it. Both codes were verified to decode from a 100 dpi render of the page, well below what a phone photo gives.
- Other machine-readability affordances, all deliberate: four corner fiducials (bottom-right is half-size, so a photo's orientation is unambiguous), heavy empty two-digit FINAL boxes per team per game, checkboxes for timeouts, a WIN tick per team per game (a second, independent record of each game's outcome, so a reader can flag a sheet whose boxes disagree with its FINAL digits), and captain initials, and a tiny `#<matchId>` per block. Bump `TEMPLATE_VERSION` in `sheet-config.ts` whenever the geometry changes in a way that would break a reader built against the old layout; it is carried in the tag, so old photos stay readable.
- Each match block carries a highlighted start-time note, as the paper sheet did. `startNote()` pins a court's first match to the clock (`scheduled + FIRST_MATCH_GRACE_MINUTES`) and tells later matches to start `TURNAROUND_MINUTES` after the previous one ends. A match that opens a *new division* on the same court counts as a first match: that is playoff week 2, where one court hosts two divisions in separate time blocks.
- The tally grid always renders in three rows. That is why regular season is `perRow: 10` to 27 and playoff game 3 is `perRow: 12` to 35; changing a range means rechecking `tallyRowCount()`. Playoff sheets pre-strike points 1-4 (games start 4-4).
- Scoring rules are restated as one-line constants in `sheet-config.ts` because `src/lib` cannot import the rules components (`src/components/rules/*.tsx`), which remain the prose source of truth. Change both together.
- A court page can span two divisions (playoff week 2), so the division lives on each match block, not on the sheet. Note the existing photo-upload feature (`score_sheets` table) keys uploads by `(season, division, match_date)` while these pages are keyed by court; reconcile when the automated reader lands.
- `dispatchNotification` accepts `attachments`, and `sendMail` carries them on the **batch** transport. Attachments must not force the single-message path: that path refuses more than one recipient and silently drops the whole send.

## Reading Photographed Score Sheets

- Pipeline lives in `src/lib/scoresheets/read/`. Everything there is pure and takes its inputs as arguments except `pipeline.ts`, which is the only module that touches storage, the database or the clock. The transcriber arrives as an argument, so the whole read runs in tests with known answers and no network.
- **Order of operations matters and is not the obvious one.** Fiducials are found first and the tag QR is decoded afterwards from the *rectified* page, padded with synthetic white. The QR is printed with `margin: 0` and is the most fragile thing on the sheet; making the read depend on decoding it from a raw photo would put the weakest link on the critical path.
- **Never choose a homography by reprojection error over four points.** Four correspondences fit exactly, so every candidate assignment scores zero and a page rectified ninety degrees out looks perfect. `scoreTransform()` judges candidates on whether they land on real printing (the ref-notes outline, the dense tag) — this was a live bug, not a hypothetical.
- **Blank detection is ink coverage, not mean brightness.** A handwritten score is thin strokes that barely move a box's average, and a blurred border halo moves it about as much. Counting pixels clearly darker than the paper separates them: empty boxes measure zero under heavy distortion, the sparsest single digit about 0.037. A box judged blank is never sent to a transcriber, which is what stops an unplayed game acquiring a score.
- `reconcile.ts` weighs the digits against the WIN ticks, `rules.ts` (every legal scoreline), and **the digit count measured off the page**. That last one exists because a real model reading "19" as "9" produces a legal score with the same winner, so neither the rules nor the tick object; only ink in the tens box knows. Because it is measured rather than claimed it outranks the model's confidence, and it is deliberately tri-state: a handwritten "1" is the sparsest mark on a sheet, so an ambiguous tens box draws no conclusion either way. Confidence is the **margin between the best and second-best legal reading**, not the model's self-report. A reading with no digit support is refused outright, so ticks cannot conjure a scoreline. The property the tests assert: a field offered at `high` is never wrong.
- A sheet where *every* box reads blank is treated as a failed read, not a night nobody played: sheets get photographed because they were written on, and a confident "no games" is the worst available way to be wrong.
- The synthetic handwriting must sit well inside its box (`synthesize.ts` insets glyphs 32%). The reader ignores the outer quarter of a box so a printed border cannot read as ink; a glyph pressed to the edge falls in that blind spot, and a "1", which is only its right-hand strokes, vanishes entirely. That was a harness bug that looked exactly like a reader bug for some time.
- Testing needs no real photos. `read/testing/synthesize.ts` draws a sheet to pixels from the same `buildSheetGeometry()` the renderer uses, so the ground truth is generated; `distort.ts` then warps, blurs, shades and JPEG-encodes it. Pass real `matchIds` when the sheet must line up with database rows.
- Nothing is ever auto-applied. A read becomes a `ScoreDraft` (`read/draft.ts`) that the admin chooses to fill into the existing form, so `match-validation.ts` and the playoff cascade in `saveScoresForDivision` still run. `winnerSide` is a side rather than a team id because a playoff block may print "Winner of M1".
- Model access defaults to **Vercel AI Gateway**, which the app already deploys behind: one credential for every provider, per-request logs, and a spend cap on the key itself. Set `AI_GATEWAY_API_KEY` and nothing else; `SCORESHEET_MODEL` swaps model without a deploy. Model ids are Gateway slugs (`provider/model`) — fetch the live list rather than guessing, since availability changes. Any other OpenAI-compatible endpoint works via `SCORESHEET_MODEL_BASE_URL`. With no key the reader still identifies the sheet and counts ticks, so dev, CI and e2e need no secret. Model choice was settled by measurement on real crops, and the ranking is not what reputation suggests: `alibaba/qwen3.5-flash` and `qwen3.7-flash` read 14/14, `google/gemini-2.5-flash-lite` 12/14, `openai/gpt-5-nano` 8/14, `amazon/nova-lite` 4/14. Several stronger-sounding models are unavailable on a free-tier Gateway account, including `google/gemini-3-flash`. Re-measure before changing the default. Across ~180 sheets a season the spread between the cheapest and dearest vision model is a couple of dollars, so pick for accuracy. Each box is sent as its own image, never tiled, so a reply cannot drift a row and attach one game's score to another; replies are checked against the ids asked for and illegal values demoted.
- Every confirmed night feeds a corpus: `read/samples.ts` keeps each cropped score box in R2 with what the reader predicted, and `labelConfirmedSamples()` fills in what was actually saved once `saveScoresForDivision` runs. Labels follow the `matches` rows rather than whatever was typed, so a sample records what the league believes. This is the path off a hosted model onto a small local classifier trained on how these referees actually write; it is strictly a by-product and never allowed to affect a read or a save.
- Photos must be captured at `SCORE_SHEET_COMPRESSION` (`src/lib/scoresheets/capture.ts`). The old 1280px default left a digit box at 21px and a QR module at 3.6px, under the decoder's floor.

## Inbound Email (Postmark → Cloudflare Worker → app)

- Postmark's inbound webhook inlines attachments as base64 (up to 35 MB per message, ~50 MB of JSON). Vercel rejects request bodies over 4.5 MB at the edge, so Postmark does **not** post to the app directly: its `InboundHookUrl` is the Cloudflare Worker in `workers/postmark-inbound/` (`https://hooks.bumpsetdrink.com/postmark/inbound`).
- The Worker verifies the same Basic credentials, streams the raw JSON into R2 under `inbound-spool/<uuid>.json`, then POSTs a `{ RecordType: "BSDSpooledInbound", SpoolKey, ContentLength }` envelope to `/api/webhooks/postmark`. The route fetches the object, runs the normal inbound dispatch, and deletes it; a bucket lifecycle rule expires stragglers after 3 days. Bounce/spam/subscription webhooks still post to the app directly.
- The Worker is a standalone pnpm package (not a workspace member; the Vercel build never installs it). `pnpm worker:install`, `pnpm worker:test` (runs inside the Workers runtime with a local R2), `pnpm worker:check-types`, `pnpm worker:deploy` (`wrangler deploy`, needs a Cloudflare login). Secrets `WEBHOOK_USER`/`WEBHOOK_PASSWORD` are set with `wrangler secret put` and must equal the app's `POSTMARK_WEBHOOK_USER`/`POSTMARK_WEBHOOK_PASSWORD`. See `workers/postmark-inbound/README.md` for the runbook.
- Keep "Include raw email" **off** on the Postmark server: it doubles the payload and the Worker refuses bodies over 90 MB.
- The Vercel WAF challenges non-browser clients site-wide; `POST /api/webhooks/postmark` and `GET /api/email-attachments/` have custom bypass rules. Any new machine-facing endpoint needs one too.
- Staff attachment downloads (`/api/email-attachments/[id]`) redirect to a 60-second presigned R2 URL rather than proxying bytes, because Vercel also caps function responses at 4.5 MB.

## Agent Behavior Expectations

- Make focused, minimal diffs aligned with existing patterns.
- Do not rewrite broad areas when a localized fix is sufficient.
- Do not edit generated or vendor-managed areas unless required.
- If a change affects behavior, verify with lint/typecheck or explain what could not be run.
