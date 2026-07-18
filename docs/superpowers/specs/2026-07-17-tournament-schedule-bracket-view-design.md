# Tournament Schedule & Bracket (player-facing view) — Design

**Date:** 2026-07-17
**Status:** Approved

## Summary

Add a polished, read-only, player-facing page that shows the tournament's
round-robin (pool) schedule and — once the tournament reaches the playoff
phase — the playoff bracket. Visible to tournament participants and admins.
Consolidates and replaces the existing plain `/dashboard/tournament-bracket`
view so there is a single, consistent bracket presentation.

## Motivation

- Players want an attractive place to see when/where their pool plays and
  where they work, on game day.
- The current playoff view (`/dashboard/tournament-bracket`) is plain
  (`25 / — / —` score rows) and hidden until the Playoffs phase, so players
  can't find it and it isn't polished.
- The admin-only `/dashboard/tournament-schedule` editor already reads all of
  the underlying data (court, time, work team per match), confirming a display
  page is primarily a presentation layer.

## Audience & Access

- **Who:** tournament participants (rostered players + captains) and
  admins/directors.
- **Page guard:** require a session, then allow if the signed-in user is
  rostered in the active tournament (`tournament_roster.user_id`) OR is
  admin/director; otherwise redirect to `/dashboard`.

## Route & Files

- `src/app/dashboard/tournament-schedule-view/page.tsx` — server component,
  page guard, renders the client view.
- `src/app/dashboard/tournament-schedule-view/actions.ts` —
  `getTournamentScheduleView()` read query returning the full shape.
- `src/app/dashboard/tournament-schedule-view/schedule-view.tsx` — client
  presentation component.
- `src/app/dashboard/tournament-bracket/page.tsx` — replaced with a redirect
  to `/dashboard/tournament-schedule-view` (route preserved, old plain UI
  removed).

## Data

Single source: `tournament_matches` for the current tournament
(`getTournamentConfig()`), plus name/pool/division lookups. `null` result when
there is no active tournament or no matches yet.

Per match the view needs: `bracket`, `pool_id`, `division_id`, `court`,
`start_time`, `home_team_id`/`away_team_id` (+ names), `work_team_id` (+ name),
per-set scores (`home_set1_score`…`away_set3_score`), `winner_team_id`.

`getTournamentScheduleView()` returns:

```
{
  tournamentName: string
  eliminationFormat: string
  myTeamId: number | null            // viewer's tournament team, else null
  divisions: Array<{
    id: number
    name: string
    pools: Array<{                    // round-robin
      id: number
      name: string
      matches: Match[]               // ordered by start_time, then court
    }>
    bracketGroups: Array<{           // playoffs, only when present
      bracket: string                // 'winners' | 'losers' | 'final'
      round: number
      matches: Match[]
    }>
  }>
}

Match = {
  id, court, startTime,
  home: { id, name } | null (TBD),
  away: { id, name } | null (TBD),
  workTeamName: string | null,
  sets: { home: (number|null)[]; away: (number|null)[] },
  winnerTeamId: number | null,
  played: boolean                    // winner set OR any set score present
}
```

Ordering: divisions by `tournament_divisions.sort_order`; pool matches by
`start_time` then `court` (nulls last); bracket matches by `bracket_round`
then `bracket_slot`.

## Presentation

- `PageHeader` with tournament name; section headings for **Round Robin** and
  **Playoffs**.
- **Round Robin:** division heading → one `Card` per pool → match rows. Each
  row: time + court chips, `Team A vs Team B`, muted work-team line, and set
  scores when `played` (winner emphasized via weight/`text-primary`, loser
  muted).
- **Playoffs:** shown only when a division has `bracketGroups`. Grouped by
  division → bracket (Winners/Losers/Final) → round, rendered as a polished
  bracket (columns per round), winner emphasized.
- **"Your team" highlight:** matches/pools involving `myTeamId` get a subtle
  ring/accent plus a "Your team" badge on the name, in both sections.
- **Empty states:** "Schedule not posted yet" when no pool matches;
  Playoffs section simply absent until bracket matches are seeded.
- Uses existing UI primitives (`Card`, `cn()`, Tailwind, remix icons) and
  dashboard status/empty-state conventions. The `frontend-design` skill guides
  the score/matchup styling so it reads as intentional, not a plain table.

## Sidebar

- New item in the existing Tournament group, label **"Schedule & Bracket"**
  (`RiCalendarLine`), URL `/dashboard/tournament-schedule-view`.
- Shown when
  `(tournament.showPoolTools || tournament.showBracketTools) && (tournament.isRostered || isAdmin)`.
- Remove the separate **"Tournament Bracket"** item (its route now redirects
  to the combined page). The admin-only **"Tournament Schedule"** editor item
  is unchanged.

## Out of Scope (YAGNI)

- No editing/mutations (read-only).
- No standings/results table beyond per-match scores.
- No live auto-refresh (server render + normal navigation).
- No change to the admin "Tournament Schedule" editor.

## Verification

- `pnpm lint` and `pnpm check-types` clean.
- Manually confirm: pool phase shows Round Robin + highlights viewer's team;
  playoff phase additionally shows Playoffs; old `/dashboard/tournament-bracket`
  redirects; non-participants are redirected from the page.
