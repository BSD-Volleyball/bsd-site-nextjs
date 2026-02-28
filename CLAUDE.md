# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start development server with Turbopack
pnpm build            # Production build
pnpm lint             # Run Biome linter
pnpm check-types      # TypeScript type checking
pnpm check-authz      # Authorization regression guard/matrix checks

# Database
npx drizzle-kit generate   # Generate migration from schema changes
npx drizzle-kit migrate    # Run pending migrations
npx @better-auth/cli generate  # Regenerate better-auth schema (rarely needed)
```

## Architecture

This is a Next.js 16 App Router application for a volleyball league management site (Bump Set Drink), built on the IndieSaas boilerplate. Players register, sign up for seasons, get drafted onto teams by captains, and track matches/playoffs.

### Domain Model

Key entities in `src/database/schema.ts`: users (with volleyball-specific fields like experience, height, skill positions), seasons, divisions (skill levels), signups (season registration with captain preference and pairing requests), teams, drafts (player-to-team assignments), matches (stored as `matchs` table), champions, waitlist, discounts, evaluations, commissioners, site_config (dynamic key-value settings), and audit_log.

### Authentication
- **better-auth** for backend auth configuration (`src/lib/auth.ts`) — email/password + Google OAuth
- **@daveyplate/better-auth-ui** for pre-built auth components (AuthCard, SignedIn, RedirectToSignUp)
- Auth client configuration in `src/lib/auth-client.ts`
- Auth provider wraps app in `src/app/providers.tsx` - controls post-login redirects and additional signup fields

### Database
- **Drizzle ORM** with PostgreSQL
- Schema defined in `src/database/schema.ts`
- Database connection in `src/database/db.ts`
- Migrations output to `./migrations/`
- Config in `drizzle.config.ts`

### Route Groups
- `(marketing)/` - Public pages with marketing layout
- `dashboard/` - Protected user area with sidebar layout (includes admin-only routes)
- `onboarding/` - Multi-step post-signup flow (gated by `@onboardingCheck` parallel route)
- `auth/` - Authentication pages (handled by better-auth-ui)

### Server Actions Pattern
Server actions are co-located with pages in `actions.ts` files:
```
src/app/dashboard/volleyball-profile/
  ├── page.tsx           # Server component
  ├── actions.ts         # "use server" mutations
  └── volleyball-profile-form.tsx  # Client form component
```

Actions return `{ status: boolean; message: string; data?: T }`. After successful mutations, client components call `router.refresh()` to update server component data.

Authorization and validation expectations for server actions:
- Enforce authorization inside each exported action (do not rely only on page-level guards).
- Prefer shared RBAC helpers from `src/lib/rbac.ts` over inline `checkAdminAccess` implementations.
- Validate critical action inputs early (for example, season-bound actions should reject non-positive/non-integer `seasonId` values).

### Admin Authorization
No middleware — authorization is checked per-action.

Primary RBAC helpers now live in `src/lib/rbac.ts`:
- `getSessionUserId()`
- `isAdminOrDirector(userId)` / `isAdminOrDirectorBySession()`
- `isCommissionerForSeason(userId, seasonId)` / `isCommissionerForCurrentSeason(userId)` / `isCommissionerBySession()`
- `isCaptainForSeason(userId, seasonId)`
- `hasAdministrativeAccessBySession()`
- `hasViewSignupsAccessBySession()`

Current policy:
- Admin/director access is role-based via `users.role`.
- Commissioner access is currently league-wide for the active season (future work may scope by division).
- Admin actions should log to audit_log via `logAuditEntry()` from `src/lib/audit-log.ts`.
- Role changes in admin tooling should invalidate active sessions for the affected user.

### Site Config System
Dynamic configuration stored in the `site_config` database table (key-value pairs). Managed at `/dashboard/site-config`. Controls: season pricing, late pricing dates, max players, registration open/closed, tryout/season/playoff dates. Access via helpers in `src/lib/site-config.ts` (`getSeasonConfig()`, `getCurrentSeasonAmount()`, `checkSignupEligibility()`).

### Integrations
- **Square** — Payment processing for season fees. Server-side via `square` SDK in `src/app/dashboard/pay-season/actions.ts`. Client-side tokenization via `react-square-web-payments-sdk`. Discount system in `src/lib/discount.ts`.
- **Resend** — Transactional emails (password reset, signup confirmation). Configured in `src/lib/auth.ts` and pay-season actions. Site email config in `src/config/site.ts`.

### Key Patterns
- Use `auth.api.getSession({ headers: await headers() })` to get session in server components/actions
- Use `src/lib/rbac.ts` helpers for role/scope checks to keep policy centralized
- Import `@/*` paths map to `./src/*`
- UI components from shadcn/ui in `src/components/ui/`
- Layout components in `src/components/layout/`
- Forms primarily use controlled components with `useState`, not react-hook-form

### Consolidated User Details Pop-up Pattern
- Shared orchestration lives in `src/components/player-detail/use-player-detail-modal.ts` (`usePlayerDetailModal`) and should be reused rather than reimplementing popup state/fetch flows.
- Open from list/table interactions using `openPlayerDetail(userId)` and close with `closePlayerDetail()`.
- Non-admin contexts should render `PlayerDetailPopup` (`src/components/player-detail/player-detail-popup.tsx`) for core player profile details, pair context, ratings, and division history.
- Admin contexts should render `AdminPlayerDetailPopup` (`src/components/player-detail/admin-player-detail-popup.tsx`) to include expanded private/admin fields (account/contact details, signup history, and draft history).
- Prefer full modal overlay usage for interactive lists (for example `view-signups`, `admin-view-signups`, `potential-captains`); use `inline` mode only for embedded drill-down experiences such as player lookup.

### Security Headers
Baseline HTTP security headers are configured in `next.config.ts`:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

### Formatting
- Biome linter with 4-space indentation
- No semicolons (except where required)
- No trailing commas
- `components/ui/`, `migrations/`, and CSS files excluded from linting
- Biome auto-fixes: unused imports, `==` to `===`, self-closing elements, Tailwind class sorting (via `cn()` function)
