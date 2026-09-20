# Coverage Feature — Design

## Context

The league needs at least one admin at the gym for the whole of every match night: the first time slot for setup, the last for cleanup, and everything between. Today there is no way to see who will be there. Admins are scattered across rosters (playing), referee assignments (reffing), and playoff work-team duty (working), and nothing rolls that up per night.

This feature adds an admin **Coverage** page that lists every upcoming match date, each time slot on that date, and the admins present in each slot, colour-coded by how well the night is covered. Admins can also mark themselves (or another admin) present for a slot they will attend without playing or reffing. A daily cron emails every admin the coverage for the following day.

### Decisions made with the user

| Topic | Decision |
|---|---|
| Data source | Derived from existing schedule data (play, ref, playoff work) **plus** coach items (captain/captain2 of a team in a `coaches = true` division) **plus** a small manual presence table. |
| Dates in scope | Regular-season and playoff nights only. Tryouts have their own volunteer system; preseason weeks are admin-run by design. |
| Slot definition | The distinct match start times on the date. Matches with a null time land in a "TBD" slot that never counts as first or last. |
| Who counts | Holders of the global `admin` role, always. `leadership_group` members are **shown** in slots when they play/ref, but only count toward the status for slots where an admin added them present manually on the Coverage page. Leadership members are not emailed the digest. |
| Unavailability | An admin with a `user_unavailability` row for the night does not count. They still appear, struck through, tagged "unavailable". |
| Manual presence | Per (date, slot start time). A "Whole night" shortcut creates one row per slot. Any admin can add or remove any admin. |
| Email | Sent every day at 11 AM Eastern for the following day's match date, to all admins, regardless of status. Subject leads with the colour word when not green. Mandatory notification type (no opt-out), deduped per date. |
| Status colours | **Red**: first or last slot has no counting admin. **Yellow**: otherwise, any middle slot has none. **Green**: every slot has at least one. A single-slot night treats that slot as both first and last. |

## Recommended approach

Reuse the per-user schedule engine (`getScheduleForUsers` in `src/lib/schedule-items.ts`) rather than re-query rosters, refs, and playoff metadata. Called once with the admin and leadership user ids for the current season, it already returns every play, work, and ref item with a league-local date and start time, and already applies permanent-sub chains, one-off pickups, and playoff work-team resolution. Coverage filters those items to upcoming dates and groups them by date and time. A separate match query defines the slots so a slot with no admins still appears.

Reuse, not rebuild:
- Admin and leadership pools: `getRecipientsWithRole(role)` in `src/lib/rbac.ts`.
- Current season: newest `seasons` row, as `getSeasonConfig()` does.
- "Today" and "tomorrow": `getLeagueDateString(offset)` in `src/lib/date-utils.ts` (America/New_York).
- Null match date resolution: same rule as `schedule-items.ts` (regular-season match with null `date` takes the date of `season_events` for its week).
- Email: `sendMail`/`dispatchNotification` in notification mode with a dedupe key; HTML via helpers in `src/lib/email-html.ts`.
- Cron: copy the bearer-token guard and `maxDuration = 300` from `src/app/api/cron/game-reminders/route.ts`; register in `vercel.json`.
- Page shape: `src/app/dashboard/assign-tryout-jobs/` (server page + `withAction` view loader + client component).
- Guards: `requireAdminOrRedirect()` (pages), `withAction` + `requireAdmin()` (actions), `logAuditEntry` for mutations.
- Nav: append to `adminNavItems` in `src/components/layout/sidebar-nav-config.ts`.

## Schema (`src/database/schema.ts`, migration `0022_coverage_presence.sql`)

One new table. New tables only, so deploy order is not critical, but the migration is still applied to prod before the code is deployed.

**coverage_presence**

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| user_id | text → users, cascade | The admin who will be present |
| event_date | date, string mode | League-local `YYYY-MM-DD` |
| slot_time | time | Start time of the slot, same string form as `matches.time` |
| note | text, nullable | Free text, e.g. "setup only" |
| created_by | text → users, set null | Who added the row |
| created_at | timestamp, default now, not null | |

Unique index `coverage_presence_user_date_slot_uniq` on (user_id, event_date, slot_time). Index `coverage_presence_date_idx` on event_date.

Why (date, time) rather than (event id, slot id): slots are derived from match times and playoff nights have no `event_time_slots` rows. A presence row whose (date, time) no longer matches any slot (a match was moved) is an **orphan**: it is surfaced on the page with a remove button, never silently dropped.

`mergeUserRecords` must repoint `coverage_presence.user_id` and `created_by` like other user-referencing tables.

## Lib layout — `src/lib/coverage/`

| File | Purpose |
|---|---|
| `types.ts` (client-safe) | `CoverageStatus = "green" \| "yellow" \| "red"`; `CoverageSource = "play" \| "work" \| "ref" \| "coach" \| "present"`; `CoveragePerson { userId, name, counts: boolean, isLeadership: boolean, unavailable: boolean, sources: CoverageSource[], presenceId: number \| null, note: string \| null }`; `CoverageSlot { startTime: string \| null, label: string, matchCount: number, people: CoveragePerson[] }`; `CoverageDate { date, eventId, eventType: "regular_season" \| "playoff", ordinal, label: string \| null, matchCount, slots: CoverageSlot[], status: CoverageStatus, reason: string, orphanedPresence: OrphanedPresence[] }`; `OrphanedPresence { presenceId, userId, name, slotTime, note }`. |
| `status.ts` (pure) | `computeStatus(slots): { status, reason }`. Ignores the TBD slot (startTime null) when picking first and last. Zero timed slots ⇒ red with reason "No timed slots". `reason` is a short sentence such as "Nobody is scheduled for the 9:00 PM slot" used by the page pill tooltip and the email banner. |
| `build.ts` (pure) | `buildCoverage(input): CoverageDate[]` where input is `{ dates: UpcomingDate[], matches: SlotMatch[], items: ScheduleItem[], presence: PresenceRow[], coaching: CoachInput[], unavailable: Set<"userId\|eventId">, people: Map<userId, SchedulePerson>, adminIds: Set<string>, leadershipIds: Set<string> }`. Groups items and `coaching` rows into slots by (date, startTime) — a coach row maps to source `"coach"` and folds into the same per-slot accumulator as play/work/ref items, ignored if its time is not a slot on that date; merges a person's sources into one row per slot; sets `counts = adminIds.has(id) && !unavailable`; marks orphans; sorts slots by time with TBD last; calls `computeStatus`. Dates with zero matches are omitted. |
| `load.ts` (server) | `loadCoverage({ fromDate, toDate? }): Promise<CoverageDate[]>`. Newest season; `season_events` rows of type regular_season/playoff with `event_date` in range; matches for the season with resolved dates in range (`matches.date`, else the week's event date for non-playoff matches) plus their `home_team`/`away_team`; `getRecipientsWithRole("admin")` and `("leadership_group")`; `teams` joined to `individual_divisions` on `(season, division)` for rows with `coaches = true`, to build `coachesByTeam` and derive `coaching` rows for in-range matches whose home/away team is coached, limited to user ids already in the admin/leadership/presence pool; one `getScheduleForUsers(ids, seasonId)` call filtered to `kind === "match" \| "ref"` on those dates; `user_unavailability` rows for those user ids and event ids; `coverage_presence` rows on those dates. Feeds `buildCoverage`. |
| `format.ts` (client-safe) | `formatSlotLabel(startTime)` ("7:00 PM"), `formatCoverageDate(date)` ("Tue Oct 6"), `STATUS_LABELS` (green "Covered", yellow "Gaps mid-night", red "Setup or cleanup uncovered"), `personTone(person)` — the shared `admin \| admin_unavailable \| leadership \| leadership_covering \| other` classifier used to colour person chips on the page and in the digest email. |

Source mapping from schedule items: `match` with `role: "play"` ⇒ `play`; `match` with `role: "work"` ⇒ `work`; `ref` ⇒ `ref`; `coverage_presence` row ⇒ `present`. Tryout and volunteer items are ignored (out of scope).

## Page — `src/app/dashboard/coverage/`

- `page.tsx`: `await requireAdminOrRedirect()`, calls `getCoverageView()`, renders `<PageHeader title="Coverage" description="Which admins are at the gym for each upcoming match night." />` and `<CoverageClient view={...} currentUserId={...} />`.
- `actions.ts` (`"use server"`, all `withAction` + `requireAdmin()`):
  - `getCoverageView(): ActionResult<{ dates: CoverageDate[], admins: { userId, name }[], today }>` — `loadCoverage({ fromDate: today })`.
  - `addPresence({ userId, date, slotTimes: string[], note? })` — validates `userId` is in the admin pool, `date >= today`, each `slotTimes` entry is a timed slot on that date; inserts with `onConflictDoNothing`; audit entry `coverage.presence.add`; returns the refreshed date.
  - `removePresence({ id })` — deletes; audit entry `coverage.presence.remove`.
  - `sendCoverageDigest({ date })` — validates `date >= today`; calls the engine; returns `{ sent, skipped }` so the client can say "already sent today" when sent is 0 and skipped > 0.
- `coverage-client.tsx` (client): one `Card` per date with a coloured left border (`border-l-4`) and a status `Badge`; header = formatted date, event label, match count, "Send digest now" button. Body = one row per slot: time label, match count, people list, "+ Add" popover. Counting admins normal with source tags; unavailable admins `line-through text-muted-foreground` with an "unavailable" tag; leadership `text-muted-foreground` with a "leadership" tag; manual entries show the note and an × remove button. A first or last slot with no counting admin gets a red row background. Orphaned presence rows render under the slots in a muted "No longer matches a slot" list with remove buttons. Empty state when no upcoming dates, linking to `/dashboard/season-config`.
- Add popover: admin `Select` (default current user), optional note `Input`, buttons "This slot" and "Whole night" (sends every timed slot on the date). After any mutation, `router.refresh()`.
- Nav: `{ title: "Coverage", url: "/dashboard/coverage", icon: RiCalendarCheckLine }` appended to `adminNavItems`; visible whenever the Admin group is.

## Email and cron

- **Notification type** `coverage_digest` in `src/lib/notifications/types.ts`: `category: null`, `stream: "outbound"`, `label: "Admin coverage digest"`, `description: "Day-before summary of which admins are at the gym."`, `mandatory: true`. Notification mode is used (not staff mode) because only notification mode carries a dedupe key.
- **Engine** `src/lib/notifications/coverage-digest.ts`: `sendCoverageDigestForDate(date): Promise<{ date, status: CoverageStatus \| null, sent, failed, skipped }>`.
  1. `loadCoverage({ fromDate: date, toDate: date })`. No date ⇒ return with `status: null`, nothing sent.
  2. Recipients = `getRecipientsWithRole("admin")`.
  3. `dispatchNotification({ type: "coverage_digest", recipients, subject, htmlBody, tag: "coverage-digest", dedupeKey: \`coverage-${date}\` })`.
  4. Subject: green ⇒ `Coverage for Tue Oct 6: all 3 slots covered`; otherwise `[RED] Coverage for Tue Oct 6: last slot uncovered` / `[YELLOW] Coverage for Tue Oct 6: 8:00 PM slot uncovered`.
- **HTML** `buildCoverageDigestHtml(opts)` in `src/lib/email-html.ts`: greeting, status banner (background colour by status, date, `reason`), a table with one row per slot (time, match count, people with plain-text tags "unavailable" / "leadership" / "present: note"), "TBD" row if present, and a button to `${site.url}/dashboard/coverage`. All names escaped.
- **Cron** `src/app/api/cron/coverage-digest/route.ts`: bearer `CRON_SECRET` guard via `timingSafeEqual`, `maxDuration = 300`, `GET` computes `getLeagueDateString(1)` and calls the engine; logs and returns the result. `vercel.json` gains `{ "path": "/api/cron/coverage-digest", "schedule": "0 15 * * *" }`.
- **Manual send** from the page reuses the same engine and dedupe key.

## Error handling

- All actions return `fail(message)` on validation failure; never throw to the client.
- `loadCoverage` treats a missing season as "no dates".
- `dispatchNotification` never throws; the cron reports counts.
- Presence insert conflicts are ignored, so double-clicks are harmless.

## Testing

- **Unit** (`src/lib/coverage/status.test.ts`, `build.test.ts`, `src/lib/email-html` coverage builder test):
  - status: all covered ⇒ green; middle gap ⇒ yellow; first empty ⇒ red; last empty ⇒ red; single slot; TBD slot ignored for ends; only admin unavailable ⇒ red; no timed slots ⇒ red.
  - build: admin counts; leadership listed with `counts: false`; unavailable admin flagged; play + present merged into one person with two sources; orphan surfaced; playoff work ⇒ `work`; tryout items ignored; zero-match date omitted; TBD slot sorted last.
  - html: escapes names, contains reason, contains tags.
- **Integration** (`src/app/dashboard/coverage/actions.integration.test.ts`): admin loads view, adds and removes presence, whole-night adds one row per slot; captain and anonymous get `{ status: false, message: "Unauthorized." }`; past date rejected; non-slot time rejected; `sendCoverageDigest` second call is a no-op (dedupe).
- **Gates**: `pnpm check-types`, `pnpm check-authz`, `pnpm test`, then `pnpm lint` last.

## Rollout

1. Generate migration `0022_coverage_presence.sql`; apply to prod with `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/run-migration.ts` before pushing code.
2. Push to main; confirm the Vercel deployment lists the new cron.
3. Invoke `/api/cron/coverage-digest` once with the secret to confirm a send or a "no date" skip for tomorrow.
4. Update `AGENTS.md` with a short Coverage note (data derivation, presence table, digest dedupe key).

## Out of scope (possible later)

- Counting leadership members toward coverage, or a configurable pool.
- Coverage for tryout nights (already served by volunteer job reminders).
- Per-slot minimum headcount above one.
- Arrival/departure time ranges instead of per-slot presence.
