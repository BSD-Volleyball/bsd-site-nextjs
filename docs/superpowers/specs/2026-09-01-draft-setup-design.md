# Draft Setup: one page, two locked steps

**Date:** 2026-09-01
**Trigger:** F26 ABA draft — the live draft board opened with no captains seated
because the commissioner set the draft order (Draft Day) but never pressed
"Lock In Picks" on Prepare for Draft. Nothing in the UI made the dependency
visible, and "done" could not be detected from data because `teams.number` is
assigned at team creation.

## Goal

Replace the two commissioner pages **Prepare for Draft** and **Draft Day** with a
single **Draft Setup** page that has two numbered, ordered steps, each with an
explicit lock, and make **Live Draft** refuse to open a division's board until
both steps are locked.

## Routes

| Old | New |
|---|---|
| `/dashboard/prepare-for-draft?divisionId=` | `/dashboard/draft-setup/rounds?divisionId=` (Step 1) |
| `/dashboard/draft-day` | `/dashboard/draft-setup/order?divisionId=` (Step 2) |
| `/dashboard/draft-setup` | redirects to `rounds` |

Old routes keep a `page.tsx` that `redirect()`s to the new one (query string
preserved). Their `actions.ts` files move with their components into the new
route folders; nothing outside these folders imports them except the authz
smoke test, which is updated.

`src/app/dashboard/draft-setup/layout.tsx` (server) renders the page header,
the division picker, and the two-step stepper. It reads
`getDraftSetupStatus()` and passes the per-step state to a client
`DraftSetupStepper`. Because App Router layouts don't receive `searchParams`,
the layout only renders the frame, and each step `page.tsx` renders the
stepper with the division-specific status it loaded. The layout exists to
share the header and keep both pages under one nav entry.

## Lock model

Two nullable columns on `individual_divisions` (already one row per
season+division):

```
draft_rounds_locked_at  timestamp
draft_rounds_locked_by  text  -> users.id (on delete set null)
draft_order_locked_at   timestamp
draft_order_locked_by   text  -> users.id (on delete set null)
```

Migration is additive (nullable columns), so it is safe to deploy in either
order relative to the code.

Writers:

- Step 1 "Lock In Picks" → existing `setCaptainRound`/`setPairDiff` calls, then
  a new `lockDraftRounds(divisionId)` action sets `draft_rounds_locked_at/by`.
  The save now iterates `data.captains` (every non-ghost captain), not only
  captains that appear in the homework-ranked player list, so a captain nobody
  ranked still gets a seat (defaults to their recommended round, or round 1
  when no recommendation exists — matching the captain email's fallback).
- Step 2 "Lock In Order" → existing `saveDraftOrder`, then sets
  `draft_order_locked_at/by` in the same action.

Re-locking is allowed at any time; it just updates the timestamp.

## Status helper

`src/lib/draft-setup.ts` exports:

```ts
type StepState = "locked" | "stale" | "unlocked"
interface DraftSetupStatus {
    rounds: { state: StepState; lockedAt: Date | null; missingCaptains: string[] }
    order:  { state: StepState; lockedAt: Date | null }
    ready: boolean   // rounds.state === "locked" && order.state === "locked"
}
getDraftSetupStatus(seasonId, divisionId): Promise<DraftSetupStatus>
```

- `rounds` is **locked** when `draft_rounds_locked_at` is set **and** every
  non-ghost `teams.captain` in the division has a `draft_capt_rounds` row.
  If the timestamp is set but a captain is missing a row (captain swapped after
  locking), it is **stale** and lists the missing captain names.
- `order` is **locked** when `draft_order_locked_at` is set. Order has no
  derived validity check: there is nothing in the data that distinguishes a
  deliberate order from the creation-time default.
- Pure logic (`computeDraftSetupStatus`) is separated from the query so it can
  be unit tested.

## Gating (hard everywhere)

- **Step 2 page**: if `rounds.state !== "locked"`, the order editor is replaced
  by a callout "Step 1 must be locked in first" with a link to Step 1. The
  stepper tab for Step 2 remains clickable so the user can see why it is
  blocked.
- **Live Draft** (`getDraftInitData`): returns `setupStatus` alongside the
  existing payload. `DraftDivisionForm` renders a readiness checklist instead
  of the Liveblocks board when `!ready`. Commissioners see each step with its
  state and a link to fix it; captains see "Your commissioner is still setting
  up the draft for this division." Submit is hidden while blocked.
- Trade-off accepted: a commissioner cannot randomize/lock the order before
  homework is in and rounds are locked.

## Sidebar

`commissionerNavItems`: replace the "Prepare for Draft" and "Draft Day" entries
with one "Draft Setup" entry (`/dashboard/draft-setup/rounds`). The phase
filter in `app-sidebar.tsx` that showed those two items now matches
`/dashboard/draft-setup/rounds`. Active-state matching uses a prefix so both
steps highlight the entry.

## Testing

- Unit: `computeDraftSetupStatus` — locked / stale (missing captain) / unlocked
  / ghost captains ignored.
- Integration: `lockDraftRounds` (auth + writes timestamp), `saveDraftOrder`
  now sets `draft_order_locked_at`, `getDraftInitData` returns
  `setupStatus.ready === false` for an unconfigured division and `true` once
  both locks exist.
- Existing prepare-for-draft / draft-day / draft-division integration tests
  move with their files and keep passing.
