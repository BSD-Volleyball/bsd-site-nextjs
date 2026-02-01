# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start development server with Turbopack
pnpm build            # Production build
pnpm lint             # Run Biome linter
pnpm check-types      # TypeScript type checking

# Database
npx drizzle-kit generate   # Generate migration from schema changes
npx drizzle-kit migrate    # Run pending migrations
npx @better-auth/cli generate  # Regenerate better-auth schema (rarely needed)
```

## Architecture

This is a Next.js 16 App Router application for a volleyball league management site, built on the IndieSaas boilerplate.

### Authentication
- **better-auth** for backend auth configuration (`src/lib/auth.ts`)
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
- `dashboard/` - Protected user area with sidebar layout
- `onboarding/` - Multi-step post-signup flow
- `auth/` - Authentication pages (handled by better-auth-ui)

### Server Actions Pattern
Server actions are co-located with pages in `actions.ts` files:
```
src/app/dashboard/volleyball-profile/
  ├── page.tsx           # Server component
  ├── actions.ts         # "use server" mutations
  └── volleyball-profile-form.tsx  # Client form component
```

### Key Patterns
- Use `auth.api.getSession({ headers: await headers() })` to get session in server components/actions
- Import `@/*` paths map to `./src/*`
- UI components from shadcn/ui in `src/components/ui/`
- Layout components in `src/components/layout/`

### Formatting
- Biome linter with 4-space indentation
- No semicolons (except where required)
- No trailing commas
- `components/ui/` and `migrations/` excluded from linting
