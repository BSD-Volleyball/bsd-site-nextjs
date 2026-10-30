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
pnpm test:e2e          # Playwright end-to-end (also runs in CI)
```

Database and auth schema workflows:

```bash
pnpm db:generate       # drizzle-kit generate, reading .env.local
pnpm db:migrate        # scripts/run-migration.ts (never drizzle-kit migrate; see below)
pnpm dlx auth@<better-auth version> generate   # the old @better-auth/cli is deprecated
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
- **Public pages must not read Postgres per request.** The Neon compute scales to zero after 5 idle minutes (not configurable on the Launch plan), so anything that queries on every hit from crawlers, calendar pollers or session polling keeps it awake. Marketing pages, the footer and the sponsors strip read season, tournament and sponsor data through the tagged `unstable_cache` wrappers in `src/next/public-cache.ts`; actions that change those rows call `updateTag(<TAG>)` beside `revalidatePath` (it expires the entry so the change shows on the next read; it throws outside a server action, where `revalidateTag(<TAG>, "max")` is the fallback). Calendar feeds are all rendered from ONE cached snapshot (`src/lib/calendar-snapshot.ts`, cached for 24 h in `src/next/calendar-feed-cache.ts`) — a cache keyed per feed does not work here because there are more feeds than 5-minute windows in an hour. **Any server action that writes a table the feeds read (matches, rosters, subs, refs, availability, signups, friendships, season events, tryout jobs… the list is `CALENDAR_FEED_TABLES`) must call `revalidateCalendarFeeds()` from `src/next/calendar-invalidation.ts` after the write**; `calendar-invalidation.test.ts` scans `src/app` and fails CI when one is missing. The public-page caches are also 24 h and rely on their tags the same way. Dashboard sidebar links use `prefetch={false}` because every dashboard page is dynamic. The homepage stays static: its signed-in redirect lives in `src/proxy.ts`, never in the page. Do not add `headers()`, `cookies()` or `searchParams` to a marketing page.
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
- Role updates that change privilege should invalidate active sessions for the affected user (call `invalidateAllSessionsForUser`). better-auth's `cookieCache` (5 minutes, `src/lib/auth.ts`) means an already-open browser can keep a revoked session for up to that long; authorization is unaffected because every permission check reads `user_roles` live.
- Roles are stored in the `user_roles` table, which is the sole authority for all role checks. The legacy `users.role` column has been removed from the schema.
- Baseline HTTP security headers are configured in `next.config.ts` (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`), plus a Content-Security-Policy that lists every third party the browser talks to (Square, Liveblocks, R2 uploads, Vercel Analytics). A new browser-side integration needs its origin added there. The policy is Report-Only for now; violations are logged by `/api/csp-report` as `[csp] Violation reported` warnings — check the Vercel logs for those before switching the header to `Content-Security-Policy`.
- **Season-bound roles are current-season by default.** `hasPermission()` with no `seasonId` matches global rows (`season_id IS NULL`) plus rows for the current season only; pass `{ seasonId }` explicitly to ask about another season. `getRecipientsWithRole()` applies the same rule. A role granted for one season must never keep working in later ones.
- **A session check is not an ownership check.** `pnpm check-authz` only proves each exported action calls *some* guard. Actions that take an id (user, team, signup, ticket) must also prove the caller may act on that id; once such a fix lands, pin it with a `strictExpectations` entry in `scripts/security/authz-regression-check.js`. Keep the guard call inside the exported action, not in a helper, so the checker can see it.
- Inbound email is attacker-controlled: render its HTML only through `sanitizeInboundEmailHtml()`, interpolate its fields into staff mail only through `escapeHtml()`, and attach it to an existing thread by subject or `X-BSD-Ticket-ID` only when the sender is already on that thread.
- **An address is owned by whoever proves it, and proving it evicts everyone else.** Sign-up needs no verified email, and Settings lets an account re-point its address at one nobody has proven. Whoever clicks the verification link (or completes a password reset) for that address becomes its sole holder: `evictPreVerificationCredentials` removes every `accounts` row (the password *and* social logins — a Google row signs in by provider id whatever the user row's email says) plus the sessions; `onPasswordReset` detaches social logins linked while the address was unverified. Any code that changes `users.email` (Settings, the admin edit) goes through `markEmailChanged()` (`src/lib/auth-verification.ts`), which drops `emailVerified` and revokes reset tokens. Email changes are throttled to one per 10 minutes per user because each one sends mail.
- **Presigned uploads sign Content-Type** (`signableHeaders` in `src/lib/r2.ts`); the S3 presigner leaves it unsigned by default, which would let the URL holder store HTML on the public pictures domain. Sponsor logos are raster only (no SVG: it can carry script, and `%2F` skips the pics-guard sandbox CSP).
- **The score-sheet reader costs money per call.** `claimAttempt()` in `read/pipeline.ts` takes an attempt in one `UPDATE … RETURNING` and refuses while another read is in flight; `finalizeSheetUpload` accepts only the `sheet_<uuid>.jpg` key it issued and `score_sheets.image_path` is unique, so one photo is one row with three attempts. Team names reach the model prompt as JSON string literals (captains choose them).
- **Payments run one at a time per key** through `withSerializedPayment()` (`src/lib/payment-lock.ts`, a Postgres advisory lock held across check → charge → record): per player for season signups and sponsorships, per tournament for tournament signups. Without it two requests both pass the pre-check and both charge before the unique index stops the second insert.
- Accepted risk (2026-10-06): captains hold Liveblocks `room:write` on their division's live-draft room, and only the browser stops them editing another team's picks. Captains are trusted volunteers and the commissioner watches the board live and submits it. Revisit if that trust changes: the fix is presence-only access plus picks through a server action.
- Accepted risk (2026-10-16): a tournament captain can roster any member by id, at signup and via "add player", without that player's consent; the rostered player is marked placed (blocked from other teams) and has not accepted the waiver unless they joined the waitlist. Captains arrange teams offline. Revisit by requiring a `tournament_waitlist` row (which records waiver acceptance) before rostering, and shrinking `getEligibleTournamentPlayers` to that pool.

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
  2. Generate the migration with `pnpm db:generate`.
  3. Apply with `pnpm db:migrate` (`scripts/run-migration.ts`), to prod before deploying code that depends on it.

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
- **E2E** (`e2e/*.spec.ts`, Playwright; runs locally and as the `e2e` CI job): `e2e/setup/auth.setup.ts` seeds the `bsd_e2e` database and creates **email/password personas** — `admin`, `captain`, `player` (`e2e/helpers.ts`) — via the real signup endpoint, saving each one's storage state. Admin accounts sign in with email/password (not only Google OAuth), so an admin-only flow runs pre-authenticated via `test.use({ storageState: PERSONAS.admin.storageState })`.

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
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (the public bucket behind `pics.bumpsetdrink.com`: player/team/score-sheet pictures, sponsor logos), `R2_PRIVATE_BUCKET` (no public domain: inbound email attachments, the inbound-email spool, the score-sheet sample corpus; required in production, falls back to `R2_BUCKET` elsewhere)
- `INBOUND_CONCERN_ADDRESS` (inbound mail to this address becomes a concern instead of an admin email ticket)
- `AI_GATEWAY_API_KEY` (reading handwritten scores off photographed sheets, through Vercel AI Gateway). Optional overrides: `SCORESHEET_MODELS` (comma-separated Gateway slugs from `https://ai-gateway.vercel.sh/v1/models`, default `google/gemini-4-argon,openai/gpt-6.1-sol`), `SCORESHEET_MODEL_API_KEY` and `SCORESHEET_MODEL_BASE_URL` for pointing at a different OpenAI-compatible endpoint. With no key the reader still identifies the sheet from its QR code, so local dev, CI and e2e need nothing set
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
- Playoff nights: the schedule engine skips a playoff match until both its teams are set, so a 7:50 "S1 vs Winner of M1, worked by Loser of M1" would credit nobody. `certainBracketAppearances()` (`src/lib/coverage/bracket.ts`, pure) walks every outcome of each division's undecided matches and credits a team's roster (and its coaches, for certain *play* only) at every slot it reaches in all of them, as `play`, `work` or `play_or_work`. It leaves out what the schedule engine already credits (matches with both teams set) so match-sub handling still applies there.
- The if-necessary final (Winner of M10 vs Loser of M10) is played only if the unbeaten side of the first final loses it; `resetFinalUnbeatenSide()` (`src/lib/playoff-sources.ts`) is the one place that rule lives, shared by coverage and the playoff card/reminder text. `ifNeededMatchNums()` flags those finals until the first final forces one, and a slot made up only of them is `ifNeeded`: shown "if needed", and left out of status and slot jobs by `scheduledSlots()` (`format.ts`), so on the final night cleanup falls to 7:50, not 8:40. The bracket walker credits nobody at an if-necessary final in the outcomes where it is not played.
- Person chips (page and digest email) share one `personTone()` classifier (`src/lib/coverage/format.ts`) mapping `{counts, isLeadership, unavailable}` to `admin | admin_unavailable | leadership | leadership_covering | other`, so the colour scheme stays in sync between the two surfaces; each renders its own legend from the same five tones.
- Status is one pure function, `computeStatus()` in `src/lib/coverage/status.ts`: red if the first or last timed slot has no counting admin, yellow for a middle gap, green otherwise. The TBD slot (null match time) never affects status. `buildCoverage()` (pure) and `loadCoverage()` (server) live beside it.
- A presence row whose (date, time) no longer matches a slot is an orphan; the page lists it with a remove button rather than dropping it, including on a night whose matches were all removed (`matchCount: 0`, empty `slots`). The one exception: a presence row whose date has no season event at all is not shown — it cannot be created through the page, and only an event deletion leaves one behind. `mergeUserRecords` repoints `coverage_presence`.
- Slot jobs: `TASK_GROUPS` in `src/lib/coverage/tasks.ts` is the one source of the gym task text (Setup / Mid-way / Cleanup), with conditional lines labelled by `TaskCondition` (`regular_season`, `playoff`, `last_regular_week`, `playoffs_next_week`), the latter two derived from `CoverageDate.nextEventType`. The page renders the full labelled list once in a "Gym jobs" card above the weekly cards; each slot then shows only a one-line "Setup — names" summary via `slotTaskKeys()`. The digest (one night) renders `slotTaskGroups()`, the resolved lines, under each slot. Setup = first timed slot, Cleanup = last, Mid-way = the timed slot just before the last (two slots: first gets setup + mid-way; one slot: all three; TBD slot: none). `slotAssigneeNames(slot)` = the people who count in that slot, shown as who the jobs fall to.
- Digest: `coverage_digest` is a mandatory notification type; `sendCoverageDigestForDate(date)` dispatches once per night with dedupe key `coverage-<date>`, so a re-run of the daily cron (`/api/cron/coverage-digest`, 15:00 UTC, for tomorrow) is a no-op. Recipients are all `admin` role holders plus any `leadership_group` member who counts in at least one slot that night (added present); leadership members who only play/ref/coach are not mailed. There is deliberately no manual "send now" button.

## Score Sheets (printable, per court)

- One PDF per match night, one letter page per court, generated on demand: `src/lib/scoresheets/`. Downloaded from a per-night button on `/dashboard/coverage` via `src/app/dashboard/coverage/score-sheets/[date]/route.ts`, and attached to the day-before coverage digest by `sendCoverageDigestForDate`. Nothing is stored; the PDF is rebuilt each time.
- **`layout.ts` is the single source of truth for the printed geometry.** `buildSheetGeometry()` returns every rectangle in PDF points; `render.ts` draws only from it. Do not hardcode a coordinate in `render.ts`. (The photo reader does not use it: it sends the whole photo to vision models.)
- **Two codes per page, with different jobs.** The large stylized QR (`public/score-sheet-qr.png`, a fixed asset embedded once per document) encodes `http://bsdvb.us/s`, which redirects (a Cloudflare redirect rule on the `bsdvb.us` zone, not this repo) to `/dashboard/upload-score-sheets`. It is deliberately generic and identical on every sheet, because one person collects the night's paperwork and works through it on one page. Identity therefore lives in the *second*, smaller QR in the bottom-right corner, squared off against the ref-notes box: `sheetTag()`, e.g. `BSD1:F26:W3:2026-10-05:4` (template version, season, week, date, court), with the human-readable `sheetCode()` printed beneath it. Both codes were verified to decode from a 100 dpi render of the page, well below what a phone photo gives.
- Corner marks sit 0.47in from each page edge with 0.1in of clear air around them (at 0.19in a printer clipped them). They served an earlier reader that located the page by them; the current reader does not need them, but they are harmless.
- Other machine-readability affordances, all deliberate: heavy empty two-digit FINAL boxes per team per game, the printed tally the referee strikes, checkboxes for timeouts, a WIN tick per team per game, captain initials, and a tiny `#<matchId>` per block. The readers use all of them as evidence: where the tally strikes stop and the WIN tick are how a model catches a referee who wrote both scores into one team's boxes. Bump `TEMPLATE_VERSION` in `sheet-config.ts` whenever the printed layout changes; it is carried in the tag.
- **Playoff blocks print their bracket number** (`printedMatchNumber()`: "MATCH #6", not 1-4 down the page), so a "Winner of M6" on any court points at the block printed "MATCH #6". The reader numbers blocks by position regardless, and its prompt says so; problems shown to admins use the printed number. A team not known at print time gets a write-in line with its slot ("Winner of M9") beneath, where a known team's captain would be. A work team named by reference ("Winner of M4") is resolved in `load.ts` from the referenced match's result when it has been decided, because nothing writes it into `playoff_matches_meta.work_team` (the cascade fills only home and away); one played later the same night keeps its label. A drawn example of two filled FINAL boxes (`FILL_EXAMPLE`) sits to the right of the instructions; the rules text must fit `rules.textWidth`, which the layout test measures.
- Each match block carries a highlighted start-time note, as the paper sheet did. `startNote()` pins a court's first match to the clock (`scheduled + FIRST_MATCH_GRACE_MINUTES`) and tells later matches to start `TURNAROUND_MINUTES` after the previous one ends. A match that opens a *new division* on the same court counts as a first match: that is playoff week 2, where one court hosts two divisions in separate time blocks.
- The tally grid always renders in three rows. That is why regular season is `perRow: 10` to 27 and playoff game 3 is `perRow: 12` to 35; changing a range means rechecking `tallyRowCount()`. Playoff sheets pre-strike points 1-4 (games start 4-4).
- Scoring rules are restated as one-line constants in `sheet-config.ts` because `src/lib` cannot import the rules components (`src/components/rules/*.tsx`), which remain the prose source of truth. Change both together.
- A court page can span two divisions (playoff week 2), so the division lives on each match block, not on the sheet. Photos uploaded through the score-sheet inbox are filed by court (`score_sheets.court`, set by the reader); `division_id` is null for them.
- `dispatchNotification` accepts `attachments`, and `sendMail` carries them on the **batch** transport. Attachments must not force the single-message path: that path refuses more than one recipient and silently drops the whole send.

## Reading Photographed Score Sheets

- Pipeline lives in `src/lib/scoresheets/read/`. `pipeline.ts` is the only module that touches storage or the database; the readers arrive as arguments (`PageReader`, `page-reader.ts`), so the whole path is tested with fakes and no network.
- **The whole photo goes to the model, with the match list.** `page-reader.ts` sends the raw JPEG plus each printed match's top and bottom team names, and gets back every game's score, a confidence, a short note, and the printed sheet code. Nothing is cropped, located or straightened first. An earlier reader (removed 2026-10-13; see git history before that date) found the corner marks, rectified the page, refined each box by its outline and sent each FINAL box alone; it read about three games in four right *whatever the model*, because one box alone has lost what a person reads handwriting by — where the tally strikes stop, the circled point, the WIN tick, the other team's score. Claude Sonnet reading one box at a time scored 40/51 on 2026-10-08; the same photos read whole scored 49-51/51 with strong models.
- **Two models from different providers, and only agreement earns `high`** (`combine.ts`). Defaults `google/gemini-4-argon` and `openai/gpt-6.1-sol`, chosen on 12 real sheets read three times each (2026-10-13): argon 99.3% right (~6s, under 1¢ a sheet), sol 98.6% with nothing confidently wrong; every model was occasionally confidently wrong on its own, and a model could read the same digit differently run to run, but where two models agreed (~97% of games) they were never wrong. A disagreement shows both readings and fills nothing; a single surviving reader is never better than `low`; an agreed but illegal score (`rules.ts`) is `low`; an agreed "not played" counts only when neither reader was unsure, because a faint score read as nothing is how a played game disappears. The property the tests assert: `high` means two models agreed on a legal score.
- **The prompt carries league knowledge that measurably mattered.** The night's rules are derived from `sheet-config.ts`, so 27-26 is known to be legal. It names the referee mistakes seen on real sheets (both scores in one team's boxes, corrections outside the boxes, a crossed-out WIN tick). And it says a lone vertical stroke is a 1: an "11" written as two lines was read as empty boxes by every model until told (Iyer v Kafer, 2026-10-01).
- **The rules are not evidence.** The prompt tells the models to report what the referee recorded even when it breaks a rule, and to say so in the note: gemini-4-argon once reported a written 27-26 as 27-25 because win by 2 "required" it (2026-10-22). Legality is judged by `rules.ts` in `combine.ts`, never by the model.
- **Agreement is not truth; a referee can contradict their own sheet.** Each reader also reports the name handwritten beside a "Winner of M6" / "Loser of M6" slot (`writtenNames`). `advancement.ts` (pure) compares it with the team the scores send forward, when the source match is on the same sheet (bracket numbers are per division, matched on division + number) and the name clearly places one of its teams by team or captain name; a contradiction is a problem on the source match, so the court is `needs_review`, not one-tap `ready`. On 2026-10-29 a sheet read Gomez 26-24 in the decider while the referee wrote Collazo into the next slot, and Collazo had won. `SheetTeam.source` carries the slot's source from `load.ts`.
- Replies use the provider's structured output (`json_schema`) and are checked again with zod; a reply missing a match or game, or naming one not on the sheet, is refused rather than attached to the wrong match. Without structured output, `gpt-6.1-sol` cut one sheet's JSON short on every run.
- **Identity**: the QR tag is decoded from the photo for free (`identity.ts`; 6/6 photos flat on a table, 3/6 folded on a lap). Failing that, an admin-chosen court, then the printed code beside the QR read by the first model (`readCode`, checked against the night's season and week). Either way the court's print record is looked up by the tag that sheet would carry, so the match list is the one that was printed. Each reader also reports the code it sees; a mismatch with the court the photo was filed under is flagged.
- Nothing is ever auto-applied. A read becomes a `ScoreDraft` (`read/draft.ts`) shown on the Upload Score Sheets court card, saved only when someone taps save, through `saveScoresForDivision`, so the validator and the playoff cascade still run. `winnerSide` is a side rather than a team id because a playoff block may print "Winner of M1".
- **Accuracy record**: `samples.ts` stores what the readers concluded for each team in each played game (`score_sheet_score_samples`, `image_path` = the photo), and `labelConfirmedSamples()` fills in what was saved once `saveScoresForDivision` runs; labels follow the `matches` rows. Each read also keeps both models' raw readings in `score_sheet_reads.result.readings`. That is how to tell whether a model has drifted or another is worth switching to. Rows from before 2026-10-13 point at cropped boxes in the private bucket.
- Model access is **Vercel AI Gateway**: one key (`score-sheets`, $20/month budget on the key itself — a key budget blocks requests even when the team has credit), per-request logs. `SCORESHEET_MODELS` swaps models without a deploy. **Re-measure before changing either model**: `scripts/data/fetch-sheet-eval-set.mts` pulls a night's photos and saved scores, `eval-page-reader.mts` runs this reader over them, `combine-check.mts` replays those readings through `combine.ts` (all gitignored, read-only). The team is on the paid Gateway tier; on the free tier the stronger models are refused and rate limits drop to 5 requests a minute. The two readers run in parallel; a sheet takes 6-30s.
- Photos must be captured at `SCORE_SHEET_COMPRESSION` (`src/lib/scoresheets/capture.ts`) so the QR decodes; the models are given the same full-resolution JPEG.

## Upload Score Sheets (one page per night, phone-first)

- `/dashboard/upload-score-sheets` (`scores:enter`) is where a night is scored: one card per court that night, built by the pure `summarizeCourts()` (`src/lib/scoresheets/court-status.ts`) from the night's matches, its photos and their reads. States: `saved` / `ready` (both readers agreed on every game: one-tap "Looks right — Save") / `needs_review` (opens the bottom-sheet editor at the flagged game, offering each reader's reading as a one-tap choice via `gameCandidates()`) / `reading` / `failed` / `no_photo` ("Enter by hand"). Photos with no court get a court picker that re-reads with the `court` hint.
- The editor takes only the six game scores; games won and the winner are derived (`court-forms.ts`), resolving "Winner of M1" slots to a fixed point like Edit Scores does. Saves go through the existing `saveScoresForDivision`, once per division on the court, so the cascade, `confirmReadsForMatches` and calendar revalidation all still run. Nothing is saved without a tap.
- `saveScoresForDivision` now runs the shared validator (`src/lib/scores/match-validation.ts`, also used by both forms) on the server after the cascade, and stamps `matches.scores_entered_by` / `scores_entered_at` (DB clock, comparable with `score_sheets.uploaded_at`) only for matches whose result changed; clearing a result, or the cascade clearing it, nulls both. Edit Scores (route still `/dashboard/enter-scores`, renamed 2026-10-16 now that entering happens on the upload page; it no longer offers photo drafts) shows "Photo by" beside each sheet thumbnail and "Saved by" on each match.
- A photo is flagged as differing from saved scores only if it arrived after they were saved; a save after the photo is trusted, corrections and all.

## Inbound Email (Postmark → Cloudflare Worker → app)

- Postmark's inbound webhook inlines attachments as base64 (up to 35 MB per message, ~50 MB of JSON). Vercel rejects request bodies over 4.5 MB at the edge, so Postmark does **not** post to the app directly: its `InboundHookUrl` is the Cloudflare Worker in `workers/postmark-inbound/` (`https://hooks.bumpsetdrink.com/postmark/inbound`).
- The Worker verifies the same Basic credentials, streams the raw JSON into R2 under `inbound-spool/<uuid>.json`, then POSTs a `{ RecordType: "BSDSpooledInbound", SpoolKey, ContentLength }` envelope to `/api/webhooks/postmark`. The route fetches the object, runs the normal inbound dispatch, and deletes it; a bucket lifecycle rule expires stragglers after 3 days. Bounce/spam/subscription webhooks still post to the app directly.
- The Worker is a standalone pnpm package (not a workspace member; the Vercel build never installs it). `pnpm worker:install`, `pnpm worker:test` (runs inside the Workers runtime with a local R2), `pnpm worker:check-types`, `pnpm worker:deploy` (`wrangler deploy`, needs a Cloudflare login). Secrets `WEBHOOK_USER`/`WEBHOOK_PASSWORD` are set with `wrangler secret put` and must equal the app's `POSTMARK_WEBHOOK_USER`/`POSTMARK_WEBHOOK_PASSWORD`. See `workers/postmark-inbound/README.md` for the runbook.
- Keep "Include raw email" **off** on the Postmark server: it doubles the payload and the Worker refuses bodies over 90 MB.
- The Vercel WAF challenges non-browser clients site-wide; `POST /api/webhooks/postmark`, `GET /api/email-attachments/`, `GET /api/calendar/` and `POST /api/csp-report` have custom bypass rules, and `POST /api/auth/*` has a 20/min/IP rate limit. Any new machine-facing endpoint needs a bypass too. (The Vercel MCP firewall tools 404 on this project; `vercel api /v1/security/firewall/config?projectId=…&teamId=…` works.)
- The bucket's public custom domain `pics.bumpsetdrink.com` serves player/team pictures, score-sheet photos and sponsor logos; **every object in the `bsd` bucket is public by key**, so private objects (email attachments, the inbound-email spool, the score-sheet sample corpus) live in `R2_PRIVATE_BUCKET` (`bsd-private`, no custom domain), reached only through the S3 API and 60-second presigned URLs. Any new private object must use `scope: "private"` in `src/lib/r2.ts`; never put it in `bsd`. The `workers/pics-guard/` Worker (`bsd-pics-guard`) serves `sponsorlogos/` with a sandboxing CSP (a belt-and-braces measure now that logos are raster only; sponsor contacts upload them) and 404s the old private prefixes on their literal routes as a tripwire; it is not a secrecy boundary (a percent-encoded slash bypasses prefix routes, found in the 2026-10 audit). `pnpm pics-guard:test` / `pics-guard:deploy` (needs a Cloudflare login).
- Staff attachment downloads (`/api/email-attachments/[id]`) redirect to a 60-second presigned R2 URL rather than proxying bytes, because Vercel also caps function responses at 4.5 MB.

## Agent Behavior Expectations

- Make focused, minimal diffs aligned with existing patterns.
- Do not rewrite broad areas when a localized fix is sufficient.
- Do not edit generated or vendor-managed areas unless required.
- If a change affects behavior, verify with lint/typecheck or explain what could not be run.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
