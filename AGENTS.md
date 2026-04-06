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
- `src/lib/`: auth, site config, shared server utilities.
- `migrations/`: SQL migrations generated/applied by Drizzle.
- `scripts/`: one-off maintenance/import scripts.

## Architecture and Coding Patterns

- Prefer App Router server components for data loading.
- Co-locate mutations in `actions.ts` with `"use server"`.
- Client forms/components generally use controlled state (`useState`) and call server actions.
- After successful mutations, call `router.refresh()` in client components to resync server-rendered data.
- Keep auth and RBAC checks explicit in actions/components.
- Prefer centralized authorization helpers in `src/lib/rbac.ts` instead of duplicating role checks in each file.
- **Server action helpers**: Use `requireSession()`, `requireAdmin()`, `requireSeasonConfig()`, and `withAction()` from `src/lib/action-helpers.ts` to reduce boilerplate. Return `ok(data)` / `fail(message)` for consistent `ActionResult<T>` response shapes.
- **Shared utilities**: Use `formatPlayerName()`, `buildPlayerPictureUrl()`, `serializeCsvField()`, `splitByGender()` from `src/lib/utils.ts` instead of defining local copies.
- **Shared components**: Use `UserCombobox` from `src/components/user-combobox.tsx` instead of local copies.
- Use `auth.api.getSession({ headers: await headers() })` directly only when session data is needed for action payloads/logging.
- Authorization uses a permission-based system: roles are stored in the `user_roles` table and permissions are defined in `src/lib/permissions.ts`. Use `hasPermissionBySession(permission)` or `hasPermission(userId, permission, context?)` for new checks.
- Backward-compatible helpers (`isAdminOrDirectorBySession`, `isCommissionerBySession`, `hasCaptainPagesAccessBySession`, `hasViewSignupsAccessBySession`) remain available and route through the new system.
- To add a new role: add it to the `Role` type and `ROLE_PERMISSIONS` map in `src/lib/permissions.ts`. No server action changes needed.
- Assign/revoke roles via the admin UI at `/dashboard/manage-roles/` or programmatically via `grantRole()`/`revokeRole()` from `src/lib/rbac.ts`.
- Administrative mutations should log audit entries through `logAuditEntry` when appropriate.

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

## Environment Notes

Common environment variables used across the app include:

- `DATABASE_URL`
- `BETTER_AUTH_BASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_WEBHOOK_TOKEN`
- `INBOUND_CONCERN_ADDRESS`
- `MAIL_FROM`
- `NEXT_PUBLIC_APP_URL`
- `PLAYER_PIC_URL`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT`
- `NEXT_PUBLIC_SQUARE_APP_ID`
- `NEXT_PUBLIC_SQUARE_LOCATION_ID`

## Agent Behavior Expectations

- Make focused, minimal diffs aligned with existing patterns.
- Do not rewrite broad areas when a localized fix is sufficient.
- Do not edit generated or vendor-managed areas unless required.
- If a change affects behavior, verify with lint/typecheck or explain what could not be run.
