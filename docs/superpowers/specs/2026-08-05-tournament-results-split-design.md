# Tournament Results Split: Roster / Pool Play / Playoffs

**Date:** 2026-08-05
**Status:** Approved

## Purpose

Make historical tournament display mirror how seasons are displayed. The single
`/dashboard/tournament-results/[tournamentId]` page splits into three pages,
and tournament playoffs render as a real bracket using the same component the
season playoff pages use.

## Routes

| Page | Route | Content |
|---|---|---|
| Roster | `/dashboard/tournament-rosters/[tournamentId]` | Per division: each team as a card — name, captain marked, players from `tournament_roster ⋈ users`. New loader (no roster view exists today). |
| Pool Play | `/dashboard/tournament-pool-play/[tournamentId]` | Existing Pool Play section: `PoolStandingsTable` per pool + `MatchBlock` match cards, per division. |
| Playoffs | `/dashboard/tournament-playoffs/[tournamentId]` | Final Rankings (`TournamentPlacementsCard`) on top, then per-division brackets rendered with `BracketView`. |
| (legacy) | `/dashboard/tournament-results/[tournamentId]` | `redirect()` to the Playoffs page so old links keep working. |

All pages: server components, `force-dynamic`, `requireSessionOrRedirect()`,
`PageHeader` titled `"{name} ({year}) — …"`, muted empty-state boxes.

## Bracket adapter (the new logic)

Pure function mapping `tournament_matches` rows → `{ upper, lower }` of
`BracketMatch[]` for `BracketView`:

- Tournament brackets store topology implicitly as
  `(bracket: 'winners'|'losers'|'final', bracket_round, bracket_slot)`; the
  adapter synthesizes stable `matchNum`s (winners rounds asc/slot asc, then
  losers, then final) and computes `nextMatchId`/`nextLooserMatchId` with the
  same progression rules as `src/lib/tournament-brackets/progression.ts`.
- Byes get negative-id placeholder matches, mirroring the season
  `buildBracketData` bye synthesis, so the bracket library's column spacing
  stays correct.
- `BracketMatch`/`BracketParticipant` types move to a neutral module and are
  re-exported from `src/app/dashboard/playoffs/[seasonId]/actions.ts` so the
  adapter does not import from a season route.
- The adapter is pure and unit-tested (single elim, double elim with byes,
  grand final).

## Navigation

- `tournamentCategories` array in `sidebar-nav-config.ts` beside
  `seasonCategories`: Roster / Pool Play / Playoffs with the three base paths.
- The sidebar Historical tournament entry becomes a `TournamentNavMenuItem`
  collapsible mirroring `SeasonNavMenuItem` (same chevron pattern, three
  sub-links).
- The All Seasons page's Tournaments table replaces its single "Results" link
  with three link columns — Roster / Pool Play / Playoffs — matching the
  seasons table above it.

## Out of scope

No changes to the live-play `tournament-schedule-view`, the admin bracket
editor (`tournament-pools`), or the `tournament_matches` schema.

## Verification

Unit tests for the adapter; `pnpm lint` / `check-types` / `check-authz`;
render checks against the real completed tournament (BSD Summer Smash 2026).
