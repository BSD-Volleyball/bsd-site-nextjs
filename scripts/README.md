# Scripts

Run TypeScript scripts with the env prefix so they read `.env.local`:

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/<script>.ts
```

Data-changing scripts are dry runs unless passed `--apply`, unless noted.

## CI and deployment

| Script | Purpose |
| --- | --- |
| `run-migration.ts` | Apply pending Drizzle migrations (`pnpm db:migrate`). Used instead of `drizzle-kit migrate`. |
| `sync-drizzle-migrations.ts` | Reconcile the Drizzle migrations journal with the database. |
| `check-migration-drift.ts` | `pnpm check-migrations` gate: migration metadata drift `drizzle-kit check` misses. |
| `security/authz-regression-check.js` | `pnpm check-authz` gate: every exported server action calls a guard, plus pinned ownership checks. |

## Operational tools

| Script | Purpose |
| --- | --- |
| `seed-initial-waiver.ts` | Idempotent seed of the v1 waiver row. |
| `attach-files-to-message.mts` | Attach files to an inbound message that already exists. |
| `find-duplicate-accounts.ts` | List members holding more than one account. |
| `find-renamed-players.ts` | Suggest legacy accounts that may be a current member under a former name. |
| `verify-credentialless-users.ts` | Mark users with no auth account email-verified so Google sign-in can link to them (better-auth's verified-only linking). Ran 2026-10-06. |

## Historical results (re-runnable)

The Wayback / local-cache import of 2000–2024 results. Parsers live in
`src/lib/wayback/` (with tests); the pipeline is
`backfill/ingest-local.ts` → `inventory.ts` → `import-wayback.ts` → `verify-import.ts`,
with `report-coverage.ts` for a per-season summary and `wayback/*.py` for
fetching snapshots.

Re-importing playoffs with `--replace-existing` wipes bracket forward
references, so afterwards always re-run:

| Script | Purpose |
| --- | --- |
| `backfill-forward-refs-scoped.ts` | Derive `playoff_matches_meta` forward refs for seasons that have none. |
| `infer-legacy-playoff-meta.ts` | Reconstruct playoff meta for table-era seasons (2000–2013). |

These detectors should always report zero:

| Script | Purpose |
| --- | --- |
| `find-phantom-reset-finals.ts` | "If necessary" reset finals recorded as played when they were not. |
| `check-stale-playoff-pages.ts` | Playoff pages that describe a different season than they are filed under. |

## `archive/`

One-off imports, backfills and data fixes that already ran against
historical schema states. They are excluded from type-checking
(`tsconfig.json`) and kept only for reference: expect them to need updates
before they would run again.

`data/` is gitignored working space for local dumps and one-off probes.
