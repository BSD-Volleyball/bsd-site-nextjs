# Scripts

## Maintenance (kept current)

| Script | Purpose |
| --- | --- |
| `run-migration.ts` | Apply pending Drizzle migrations (`DOTENV_CONFIG_PATH=.env.local npx tsx scripts/run-migration.ts`). Required because the Prisma Accelerate database is incompatible with `drizzle-kit migrate`. |
| `run-single-migration.ts` | Apply a single migration file by name. |
| `sync-drizzle-migrations.ts` | Reconcile the drizzle migrations journal with the database. |
| `seed-ghost-captain.ts` | Seed the ghost-captain placeholder user. |
| `seed-initial-waiver.ts` | Seed the initial waiver record. |
| `set-ref-rates.ts` / `set-seasons-list.ts` / `set-notification-list.ts` | Recurring admin data maintenance. |
| `create-test-data.ts` | Populate a development database with test data. |
| `security/authz-regression-check.js` | `pnpm check-authz` gate — scans every exported server action for an authorization guard. |

Run TypeScript scripts with the env prefix so they read `.env.local`:

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/<script>.ts
```

## `archive/`

One-off imports, backfills, and data fixes that already ran against
historical schema states. They are excluded from type-checking
(`tsconfig.json`) and kept only for reference — expect them to need
updates before they would run again.
