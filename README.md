# BSD Volleyball League

A web application for managing a draft-based community volleyball league. Players can register, sign up for seasons, get drafted onto teams, and track matches throughout the season.

## Features

- **Player Registration & Onboarding** - Multi-step signup collecting contact info or volleyball experience
- **Season Sign-ups** - Players register for upcoming seasons with captain preferences and availability
- **Draft System** - Captains draft players onto teams based on skill assessments
- **Team Management** - Track team rosters, divisions, and match schedules
- **Match Tracking** - Record scores and determine division champions
- **Player Profiles** - Track experience level, height, and skill positions (setter, hitter, passer)

## Tech Stack

- **Next.js 16** - React framework with App Router and Turbopack
- **Better Auth** - Authentication with email/password and Google OAuth
- **PostgreSQL** - Database
- **Drizzle ORM** - Type-safe database queries and migrations
- **shadcn/ui** - UI component library
- **Square** - Payment processing for season fees
- **Postmark** - Transactional and broadcast emails
- **Biome** - Linting and formatting
- **Tailwind CSS v4** - Styling

## Development

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL database

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Configure environment variables (copy `.env.example` to `.env.local`)

Required for player picture uploads to Cloudflare R2:
- `PLAYER_PIC_URL` (public base URL used to display pictures, typically ending in `/playerpics/`)
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

Player pictures are uploaded under the `playerpics/` prefix in the R2 bucket.

R2 bucket CORS must allow browser `PUT` from your app origin with
`Content-Type` header.

3. Run database migrations:
```bash
npx drizzle-kit migrate
```

4. Start development server:
```bash
pnpm dev
```

### Commands

```bash
pnpm dev          # Start dev server with Turbopack
pnpm build        # Production build
pnpm lint         # Run Biome linter
pnpm check-types  # TypeScript type checking
```

### Testing

```bash
pnpm test              # Unit + integration tests (Vitest)
pnpm test:watch        # Watch mode
pnpm test:unit         # Unit tests only (no database needed)
pnpm test:integration  # Integration tests only (needs local Postgres)
pnpm test:coverage     # Full run with V8 coverage report
pnpm test:e2e          # Playwright end-to-end tests (local only)
```

Layout:

- **Unit tests** (`src/**/*.test.ts`, colocated) cover pure logic. The db
  singleton is aliased to a guard that throws, so unit tests can never touch
  a database.
- **Integration tests** (`src/**/*.integration.test.ts`, colocated) run real
  server actions against a local Postgres. A template database
  (`bsd_test_template`) is built once from `migrations/` and cloned per
  Vitest worker; `better-auth` sessions are fabricated (see
  `src/test/session.ts`) while role checks stay real. Shared harness lives
  in `src/test/`. To exercise an admin-gated action, open the test with
  `createUserWithRoles([{ role: "admin" }])` (from `@/test/session`) — it
  creates a user, inserts the `user_roles` rows, and logs the fabricated
  session in as that admin so `requireAdmin()`/`requirePermission()` pass for
  real. Non-admin and unauthenticated cases are just `createUserWithRoles([{ role: "captain" }])` or no login at all.
- **E2E tests** (`e2e/*.spec.ts`) drive the real app with Playwright against
  a dedicated `bsd_e2e` database. Local-only; not run in CI. The setup project
  (`e2e/setup/auth.setup.ts`) creates three **email/password personas** —
  `admin`, `captain`, and `player` (see `e2e/helpers.ts`) — through the real
  better-auth signup endpoint and saves each one's signed-in storage state.
  Admin accounts authenticate with email/password (not only Google OAuth), so
  a spec covering an admin-only flow runs pre-authenticated via
  `test.use({ storageState: PERSONAS.admin.storageState })`.

One-time local Postgres setup (integration + e2e tests):

```bash
sudo apt-get install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt-get install -y postgresql-17
sudo pg_ctlcluster 17 main start
sudo -u postgres psql -c "CREATE USER bsd_test WITH PASSWORD 'bsd_test' CREATEDB;"
```

The harness connects to `postgres://bsd_test:bsd_test@localhost:5432` by
default (override with `TEST_PG_URL`; localhost is enforced). CI runs lint,
typecheck, check-authz, and the Vitest suites on every push and PR via
`.github/workflows/ci.yml` with a Postgres 17 service container.

### Database

```bash
npx drizzle-kit generate  # Generate migration from schema changes
npx drizzle-kit migrate   # Run pending migrations
```

## Credits

Originally based on [IndieSaas Starter](https://github.com/indieceo/Indiesaas) boilerplate.

- [Better Auth UI](https://better-auth-ui.com) - Authentication components
- [shadcn/ui](https://ui.shadcn.com) - UI components
