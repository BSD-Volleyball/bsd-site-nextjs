# Surveys Feature — Implementation Plan

## Context

The league wants to survey its members at various points in the year, most commonly an end-of-season survey to everyone who played. Today there is no survey capability at all: the closest things are the broadcast email tool (audience targeting), the notification registry (opt-outs, dedupe, crons), and a few row-based config editors. This plan adds a complete survey subsystem: reusable **templates** of configurable questions with answer-based and role-based branching, **survey instances** sent to a snapshotted audience with invitation + reminder emails, a respondent flow on the dashboard with autosave, and admin reporting including **cross-survey trends** per question.

### Decisions already made with the user

| Topic | Decision |
|---|---|
| Anonymity | Per-survey flag. Anonymous responses are **severed from the user on submit** (id stripped, timestamps coarsened to the league day). Anonymous surveys are therefore single-submit; identified surveys are editable until close. |
| Audience | Union of one or more existing email recipient groups, plus add/remove individuals. Snapshotted into `survey_recipients` at publish. Late recipients can be added after publish. |
| Permissions | Two new permissions `surveys:manage` and `surveys:view_results`, admin-only for now. |
| Responses | Autosave drafts; editable until close (identified only). Reminders stop at submit. |
| Question types | yes_no, rating (1-5 / 1-10 / NPS 0-10 presets, custom min/max + end labels), likert (5-point preset), single_choice, multi_choice, text (short/long), ranking, plus a no-answer `section` header type. |
| Reminders | Per survey: every N days after invite, up to M reminders, never after close. Daily cron. Plus admin "Send reminder now". |
| Email opt-out | `survey_invitation` mandatory (no opt-out). `survey_reminder` opt-out-able under a new "Surveys" category. |
| Templates | Questions live on the template. Once a question has answers its type/options lock (wording, help text, required, visibility, order stay editable; options may be appended and relabeled, never removed or re-keyed). Adding a question starts a new trend; archiving ends one but keeps it for past instances. Trends match on question id. |
| Publish | Manual only (admin confirms recipient count). `opens_at` is informational. Scheduled publish is a possible later addition (`status = "scheduled"` + cron), no schema change needed. |
| Coach tag | In a division with `individual_divisions.coaches = true`, both `teams.captain` and `captain2` get `coach` (not `captain`). Elsewhere both get `captain`. |

## Recommended approach

Normalized rows for questions and answers (not JSON blobs), with jsonb only for per-question config and visibility rules. Rows are what make the lock rule, segment filters, and cross-instance trend queries cheap; volume is tiny (hundreds of respondents × tens of questions × a few surveys a year).

Reuse, not rebuild:
- Audience: `ensureRecipientGroup()` + `getRecipientsForGroup()` in `src/lib/email-recipients.ts` (same public API `send-email/actions.ts` uses).
- Email: `dispatchNotification()` in `src/lib/notifications/dispatch.ts` with dedupe keys; HTML via `renderEmailHtml`-style builders in `src/lib/email-html.ts`.
- Cron: copy `isAuthorized` + `maxDuration` from `src/app/api/cron/game-reminders/route.ts`; reminder engine shaped like `src/lib/notifications/volunteer-reminders.ts`.
- Config editor idiom: `src/app/dashboard/configure-tryout-jobs/` (stable client keys, `id: number | null`, diff-save in a transaction, warn before removing rows with responses).
- Reporting structure: `src/app/dashboard/insurance-report/` (pure logic file + actions + client), charts like `src/app/dashboard/attrition/attrition-charts.tsx` (recharts, `var(--chart-N)` tokens), CSV via `buildCsvContent`/`downloadCsv`/`buildTimestampedCsvFilename` in `src/lib/csv-download.ts`.
- Guards: `withAction` + `requireSession()` + `requirePermission()` from `src/next/action-helpers.ts`; `requirePermissionOrRedirect()` / `requireSessionOrRedirect()` from `src/next/page-guards.ts`; `logAuditEntry` from `src/lib/audit-log.ts`.
- Dashboard card pattern: the colored `Card` + `Link` cards in `src/app/dashboard/page.tsx` (e.g. Week 2 homework card); nav in `src/components/layout/sidebar-nav-config.ts` (`adminNavItems`) and `app-sidebar.tsx`; flags from `src/app/dashboard/sidebar-actions.ts`.

## Schema (`src/database/schema.ts`, migration `0021_surveys.sql`)

Types imported type-only from `src/lib/surveys/types.ts` (same idiom as `SignupDropStage`). All new tables: `serial` ids, `timestamp().defaultNow().notNull()`, indexes named `<table>_<cols>_idx`. New tables only, so no expand–contract concern; still apply the migration to prod before deploying.

- **survey_templates**: id, name, description, is_archived, created_by (set null), created_at, updated_at.
- **survey_questions**: id, template_id (cascade), sort_order, type `text().$type<SurveyQuestionType>()`, prompt, help_text, required, config `jsonb.$type<SurveyQuestionConfig>()`, visibility `jsonb.$type<SurveyVisibility>()` default `{"conditions":[],"roleTags":[]}`, archived_at, created_at. Index (template_id, sort_order).
- **surveys**: id, template_id (restrict), season_id (set null, nullable), title, intro, status `draft|open|closed`, is_anonymous, audience `jsonb.$type<SurveyAudienceDefinition>()`, question_ids `jsonb number[]` (frozen at publish; null while draft), opens_at, closes_at, reminder_interval_days (0 = none), reminder_max_count, reminder_count, last_reminder_at, published_at, closed_at, created_by, created_at, updated_at. Indexes on template_id, season_id, status.
- **survey_recipients**: id, survey_id (cascade), user_id (cascade), role_tags jsonb `SurveyRoleTag[]`, division_id (set null), gender `male|non_male|null`, invited_at, submitted_at (anonymous: league-day midnight), removed_at, added_by (null = from snapshot). Unique (survey_id, user_id); index user_id.
- **survey_responses**: id, survey_id (cascade), user_id nullable, recipient_id nullable (both NULL once an anonymous response is submitted), role_tags, division_id, gender, status `draft|submitted`, submitted_on `date` (day granularity), created_at, updated_at. Partial unique (survey_id, user_id) WHERE user_id IS NOT NULL; index (survey_id, status).
- **survey_answers**: id, response_id (cascade), question_id (cascade), value_bool, value_number, value_text, value_options jsonb `string[]` (option keys; ordered for ranking), updated_at. Unique (response_id, question_id); index question_id (lock check + trends).

Why jsonb for visibility instead of a conditions table: conditions are always loaded with the whole question list, evaluated in-process, 0–3 per question, edited as one unit; referential checks (dependency precedes, unarchived, option keys exist, no cycles) are done in code by `validateVisibilityGraph()` on every save.

Why `question_ids` snapshot per instance: makes "adding starts a new trend, archiving ends one but keeps it for past instances" automatic. Draft surveys render the live template; wording edits propagate to open instances (intended).

Anonymity mechanics on submit (one transaction): recipient `submitted_at` = league-day midnight; response `user_id`/`recipient_id` = NULL, `status = submitted`, `submitted_on` = league day, `created_at`/`updated_at` = league-day midnight; answers `updated_at` = league-day midnight. `is_anonymous` locks after publish. Results UI applies small-cell suppression (< 5 responses in a segment) for anonymous surveys; CSV of an anonymous survey never contains identity.

## Lib layout — `src/lib/surveys/`

| File | Purpose |
|---|---|
| `types.ts` (client-safe) | All types: `SurveyQuestionType`, `SurveyOption {key,label}`, discriminated `SurveyQuestionConfig`, `SurveyVisibility {conditions[], roleTags[]}` with conditions `in/not_in` (choice, likert, yes_no, ranking first place) and `eq/gte/lte` (rating), `SurveyRoleTag` (`signed_up, rostered, captain, coach, commissioner, referee, ref_coordinator, waitlisted, dropped, first_season, returning, admin, leadership_group, tryout_volunteer`), `SurveyAudienceDefinition {groups[], addUserIds[], removeUserIds[]}`, statuses, `RATING_PRESETS`, `LIKERT_PRESET` (fixed keys), `SURVEY_LIMITS`, type guards, `validateAudience()`, `describeAudienceGroup()`. |
| `question-types.ts` (client-safe) | Registry `QUESTION_TYPE_DEFS` per type: label, `hasAnswer`, `defaultConfig()`, `validateConfig()`, `validateAnswer(question, value)` (range, keys exist, ranking is a permutation, multi min/max, text length), `toColumns()` / `fromColumns()`, `isEmpty()`. `AnswerValue = boolean | number | string | string[]`. |
| `visibility.ts` (pure) | `evaluateVisibility({questions, answers, roleTags}) → Set<questionId>`: role tags any-of; conditions AND; hidden or unanswered parent ⇒ hidden child. `validateVisibilityGraph(questions) → string[]`. |
| `validate-submission.ts` (pure) | `validateSubmission({questions, answers, roleTags, mode: draft|submit})` → `{visible, cleaned, errors}`; strips hidden/unknown answers; enforces `required` only in submit mode. Shared by client form and submit action. |
| `template-rules.ts` (pure) | `validateQuestionUpdate(existing, incoming, hasAnswers)` (lock rule), `canArchiveQuestion()` (refuse if depended upon). |
| `questions-for-survey.ts` (pure) | `questionsForSurvey(survey, templateQuestions)`; `seriesOrderKey(instance)` = `seasonRecencyKey()` from `src/lib/season-utils.ts` when season set, else from `published_at`. |
| `reporting.ts` (pure) | `aggregateQuestion`, `aggregateSurvey({questions, responses, filter})` (response rate, per-question aggregates: yes%, rating mean/median/distribution, NPS, choice counts/%, likert top-box + mean, ranking avg position + first-place counts, text list), `SegmentFilter {roleTag?, divisionId?}`, `suppressSmallCells()`, `trendValues(question, aggregate)` (one or more series per question), `buildTrend(questions, instances)`, `buildResponsesCsv(questions, responses, {anonymous})`. |
| `role-tags.ts` (server) | `computeRecipientSegments(seasonId, userIds) → Map<userId, {roleTags, divisionId, gender}>` batched with `inArray`: signups, drafts⋈teams (rostered + division), teams.captain/captain2 (+ coaches-division rule), user_roles (commissioner, ref_coordinator, tryout_volunteer for season; admin, leadership_group global), season_refs, waitlist, signup_drops (restored_at null), first_season/returning from earliest signups/drafts season, gender from `users.male`. |
| `audience.ts` (server) | `resolveAudience(def, seasonId) → {recipients, groupCounts}` via `ensureRecipientGroup` + `getRecipientsForGroup`, union by userId, plus/minus individuals; rejects `self` and season-bound groups without a season. |
| `lifecycle.ts` (server) | `publishSurvey(surveyId, actorId)` (transaction: validate graph, snapshot question_ids, resolve audience, compute segments, insert recipients, set open/published_at; then `sendSurveyInvitations`), `closeSurvey`, `autoCloseExpiredSurveys(now)`, `addRecipients` (segments + invite with same dedupe key so only new addresses send), `removeRecipient` (sets removed_at, keeps any submitted response). |
| `respondent.ts` (server) | `listSurveysForUser`, `getSurveyForRespondent` (recipient check, questions, existing response, `canEdit`), `saveDraft`, `submitResponse` (anonymisation transaction; identified re-submit allowed while open), `isSurveyOpenNow`. |
| `reminders.ts` (server) | `sendDueSurveyReminders(now)` selects open surveys with interval > 0, count < max, `coalesce(last_reminder_at, published_at) + interval <= now`, not past close. `sendSurveyReminder(surveyId, {force})`: optimistic claim `UPDATE ... SET reminder_count = reminder_count + 1 WHERE reminder_count = ?`, recipients = not submitted/not removed, `dispatchNotification({type: "survey_reminder", dedupeKey: "survey-<id>-reminder-<n>"})`. `sendSurveyInvitations`: `type: "survey_invitation"`, `dedupeKey: "survey-<id>-invite"`, per-recipient link `${site.url}/dashboard/surveys/<id>`. |

Also: `src/lib/email-html.ts` gains `buildSurveyInvitationHtml` and `buildSurveyReminderHtml`; `src/lib/permissions.ts` gains `surveys:manage` and `surveys:view_results` in `Permission` + `ALL_PERMISSIONS`.

## Notifications and cron

- `src/lib/notifications/types.ts`: category `surveys` ("Surveys" / reminder copy); types `survey_invitation` `{category: null, stream: "outbound", mandatory: true}` and `survey_reminder` `{category: "surveys", stream: "automated-reminders"}`. Update `STREAM_LABELS["automated-reminders"]` copy. Existing `types.test.ts` invariants (every category has a toggleable type) still hold. Preferences editor renders the new category with no UI change.
- `src/app/api/cron/survey-reminders/route.ts`: `GET` → `autoCloseExpiredSurveys(now)` then `sendDueSurveyReminders(now)`, logger line, JSON result. `vercel.json` cron `30 15 * * *`.
- Ops checklist: confirm the Vercel WAF bypass rule covering `/api/cron/*` also covers the new path before the first run (AGENTS.md: new machine-facing endpoints need one).

## Routes and UI

Admin (`src/app/dashboard/manage-surveys/`, guard `requirePermissionOrRedirect("surveys:manage")` unless noted):
- `page.tsx` + `surveys-list.tsx`: instances table (title, template, season, status, response rate, closes, reminders n/max), "New survey" dialog, links to editor/results. Tabs: Surveys / Templates.
- `templates/page.tsx` + `templates-list.tsx`; `templates/[templateId]/page.tsx` + `template-editor.tsx`: question cards (type select disabled + lock badge when answered, prompt, help, required, type-specific config panel, option editor with hidden stable keys, visibility panel: answer condition builder over earlier questions + role-tag checkboxes), reorder via move up/down buttons plus HTML5 drag copied from `draft-homework/round-group.tsx`, archive/restore, whole-template diff-save, preview pane rendering the respondent form with a role-tag picker to test branching.
- `templates/[templateId]/trends/page.tsx` (guard `surveys:view_results`) + `trends-client.tsx`: per question a recharts `LineChart` (one `Line` per series, x = instance ordered by `seriesOrderKey`, tooltip shows n) and a comparison table.
- `[surveyId]/page.tsx` + `survey-editor.tsx`: settings (title, intro, season, anonymity switch with trade-off note, opens/closes datetime in league TZ, reminder interval/max), audience builder (group checkboxes with season/division/team sub-selects, add/exclude via `UserCombobox`, "Preview audience" count + names), publish confirm dialog (count + anonymity), post-publish: recipients table, add late recipient, send reminder now, close now; delete only in draft.
- `[surveyId]/results/page.tsx` (guard `surveys:view_results`) + `results-client.tsx`: header stats, segment filters, per-question cards (bar/stacked charts, stats tiles, ranking table, paginated text answers), CSV export (identity columns only when identified; raw CSV of identified surveys additionally requires `surveys:manage`), small-cell suppression banner for anonymous.

Respondent (`src/app/dashboard/surveys/`, guard `requireSessionOrRedirect()`):
- `page.tsx`: Open (Not started / In progress / Submitted with Start / Continue / Edit / View) and Past lists.
- `[surveyId]/page.tsx` + `survey-form.tsx`: re-runs `evaluateVisibility` on every change, hidden questions unmount and drop answers, debounced (~800 ms) autosave with Saving/Saved indicator, inline errors from `validateSubmission`, submit (anonymous: confirm "cannot be edited after submit"), success screen, read-only when closed or anonymous-submitted.

Shared: `src/components/surveys/question-input.tsx` (one input per type), `src/components/surveys/ranking-input.tsx`, `src/components/dashboard/survey-card.tsx` rendered from `src/app/dashboard/page.tsx` when the user has un-submitted open surveys. Sidebar: `surveysNavItem` (`RiSurveyLine`) shown when `SidebarData.hasSurveys`; "Manage Surveys" added to `adminNavItems`.

## Server actions (all `withAction`, `requireSession()` + `requirePermission(...)`; `pnpm check-authz` enforces)

`manage-surveys/actions.ts` (`surveys:manage` unless noted): `getSurveyTemplates`, `createSurveyTemplate`, `updateSurveyTemplate`, `archiveSurveyTemplate`/`restoreSurveyTemplate` (refuse while an instance is open), `getSurveyTemplateEditor` (questions + hasAnswers), `saveTemplateQuestions`, `archiveTemplateQuestion`/`restoreTemplateQuestion`, `getSurveys`, `getSurveyEditorOptions` (seasons, divisions, teams, user directory via `listUserNames`), `createSurvey`, `updateSurveySettings`, `updateSurveyAudience` (draft only), `previewSurveyAudience`, `publishSurvey` (fails on 0 recipients or 0 answerable questions), `closeSurvey`, `deleteSurvey` (draft only), `getSurveyRecipients`, `addSurveyRecipients`, `removeSurveyRecipient`, `sendSurveyReminderNow`, `resendSurveyInvitations` (same dedupe key; covers publish-time timeouts), and with `surveys:view_results`: `getSurveyResults(surveyId, filter)`, `getSurveyRawResponses`, `getTemplateTrends`. Mutations write `logAuditEntry` (`survey_template_create/update`, `survey_create/publish/close/delete`, `survey_recipient_add/remove`, `survey_reminder`) and `revalidatePath`.

`surveys/actions.ts` (respondent, `requireSession()`): `getMySurveys`, `getMySurvey`, `saveSurveyDraft`, `submitSurveyResponse` (server-side visibility + validation is authoritative).

## Tests

Unit (colocated `*.test.ts`): `visibility`, `question-types`, `validate-submission`, `template-rules`, `questions-for-survey`, `reporting` (yes%, rating stats, NPS, choice %, ranking positions, likert, segment filter, suppression, trend ordering and gaps, CSV omits identity when anonymous), two cases in `email-html.test.ts`.

Integration (`createUserWithRoles` from `src/test/session.ts`; new factories `createSurveyTemplate`, `createSurveyQuestion`, `createSurvey`, `createSurveyRecipient` in `src/test/factories.ts`):
- `manage-surveys/actions.integration.test.ts`: authz triad (unauthenticated / captain / admin) on representative actions; template CRUD + lock rule; publish snapshot with expected role tags from seeded captain/commissioner/waitlist/signup rows; mocked `sendBatchEmails` called with one message per recipient containing the survey link; double publish fails; late recipient dispatches only to the new user; anonymity locked after publish; results segment filter + suppression; trends ordered by season.
- `surveys/actions.integration.test.ts`: non-recipient/removed/closed → fail; draft autosave round-trip; hidden answers stripped server-side; required enforcement only on visible; identified re-submit; anonymous submit nulls identity and coarsens timestamps, second submit fails.
- `src/lib/surveys/reminders.integration.test.ts`: due selection, exclusions, idempotent re-run, force, counters, auto-close.
- `src/lib/surveys/role-tags.integration.test.ts`: each tag source, first_season vs returning.

## Phased delivery (each phase ends green on `pnpm lint`, `pnpm check-types`, `pnpm check-authz`, `pnpm test`, `pnpm check-migrations`; commit + push per phase per repo convention)

1. **Schema, lib core, templates**: types/registry/visibility/validation/rules + unit tests; permissions; schema + `0021_surveys.sql` (generate with `DOTENV_CONFIG_PATH=.env.local npx drizzle-kit generate`, apply with `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/run-migration.ts` before deploy); factories; template actions, pages, editor, preview; admin nav; template integration tests.
2. **Surveys, audience, publish, respondent flow**: role-tags, audience, lifecycle, respondent lib; `survey_invitation` type + HTML; survey list/editor/audience/publish/recipients; respondent pages, inputs, autosave, submit, anonymisation; dashboard card + sidebar item; integration tests.
3. **Reminders and cron**: `survey_reminder` type + category + HTML; reminders lib + auto-close; cron route + `vercel.json`; WAF check; send-now + resend-invitations buttons; reminder tests.
4. **Reporting and trends**: reporting lib + tests; results/raw/trends actions; results and trends clients with charts and CSV; integration tests for results/trends authz.

## Risks / notes for implementation

- Ranking + appended option: `validateAnswer` accepts a permutation of options as of submission; the client appends new options to stale drafts.
- Autosave is last-write-wins across tabs (document in code).
- `all_users` audiences (~2k) publish inside a server action: recipients are inserted first, invites dispatched after; `resendSurveyInvitations` recovers a timeout. Consider `maxDuration = 300` on the manage-surveys segment.
- `closes_at` stored UTC, entered/displayed in `LEAGUE_TIME_ZONE` via `src/lib/date-utils.ts` (`getLeagueDateString`, `formatFullTimestamp`).
- Anonymous CSV still carries role tags/division; strip segment columns when total submitted < 10 (decide in phase 4).
- Out of scope for now, easy later: scheduled publish, sharing aggregate results with respondents, non-admin result viewers (permission already exists).

## Verification

1. Unit + integration suites above pass locally (`pnpm test`); template DB tripwire confirms the migration matches schema.
2. Manual run on `pnpm dev` at http://localhost:3000 as an admin (email/password admin persona pattern from `e2e/helpers.ts`): create template with every question type, a rating-conditional question and a captain-only question; create a survey for the current season with `season_signups` + `season_captains`, add one person, preview audience, publish; confirm `notification_log` rows with `survey-<id>-invite` keys and one email per recipient (Postmark sandbox or log inspection).
3. As a captain persona: dashboard card appears, fill the survey, verify branching shows/hides live, autosave survives reload, submit; as a non-captain the captain-only question is absent and cannot be posted (server strips it).
4. Anonymous survey: after submit, `survey_responses.user_id IS NULL`, recipient `submitted_at` is midnight; edit is refused.
5. Trigger `GET /api/cron/survey-reminders` with the bearer secret twice: first sends to un-submitted recipients, second is a no-op (dedupe), counters updated; survey past `closes_at` flips to closed.
6. Results page shows correct aggregates and segment filtering; run a second instance of the template for another season and confirm the trends page charts both points in season order; CSV downloads with identity only for identified surveys.
