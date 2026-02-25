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
- **Resend** - Transactional emails
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

### Database

```bash
npx drizzle-kit generate  # Generate migration from schema changes
npx drizzle-kit migrate   # Run pending migrations
```

## Credits

Originally based on [IndieSaas Starter](https://github.com/indieceo/Indiesaas) boilerplate.

- [Better Auth UI](https://better-auth-ui.com) - Authentication components
- [shadcn/ui](https://ui.shadcn.com) - UI components
