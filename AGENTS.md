# AGENTS.md

Guidance for coding agents working in this repository.

## Project Summary

- App: BSD Volleyball League management platform (Next.js App Router).
- Scope: player onboarding, season signup/payment, drafting, rosters, scheduling, playoffs, admin tooling.
- Primary stack: Next.js 16, React 19, TypeScript, PostgreSQL, Drizzle ORM, better-auth, shadcn/ui, Tailwind CSS v4, Biome.

## Working Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm check-types
```

Database and auth schema workflows:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
npx @better-auth/cli generate
```

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
- Keep auth checks explicit in actions/components with:
  - `auth.api.getSession({ headers: await headers() })`
- Admin authorization is role-based via `users.role` (`admin` or `director`) and checked per action.
- Administrative mutations should log audit entries through `logAuditEntry` when appropriate.

## Database Conventions

- Use Drizzle query builders (`eq`, `and`, `inArray`, `desc`, etc.) and typed selects.
- Keep DB column naming conventions intact (snake_case in schema mappings).
- Preserve existing legacy spellings/table names unless explicitly migrating them:
  - `users.preffered_name`
  - `matchs` table
- For schema changes:
  1. Update `src/database/schema.ts`.
  2. Generate migration with `npx drizzle-kit generate`.
  3. Apply with `npx drizzle-kit migrate`.

## UI and Styling Conventions

- Reuse components from `src/components/ui/` and layout primitives from `src/components/layout/`.
- Use Tailwind utility classes; prefer `cn()` when conditionally combining classes.
- Maintain existing UX patterns in dashboard tables/forms (status messages, loading state, empty states).

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
- `RESEND_API_KEY`
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
