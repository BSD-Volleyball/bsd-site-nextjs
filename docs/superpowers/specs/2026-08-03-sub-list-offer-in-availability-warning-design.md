# Sub-list offer in signup availability warnings

Date: 2026-08-03

## Problem

On the "schedule" tab of the season signup wizard (`/dashboard/pay-season`),
players check the dates they will miss. Three warning banners can fire:

1. Missing every tryout date.
2. Missing four or more dates overall.
3. Missing every playoff date.

Each banner asks "Are you sure you want to play this season?" but offers no
alternative. A player who reads it and agrees they should not commit to a full
season has nowhere to go except abandoning the wizard.

## Goal

Offer those players the sub list (the `waitlist` table) as an alternative, so
the warning ends in a choice rather than a dead end.

## Design

### Placement

A single call-to-action renders once, below whichever warnings fired — not once
per warning. All three warnings can be visible simultaneously, and repeating the
waiver block up to three times would be noise.

Copy:

> **Prefer to sub instead?**
> Join the sub list and we'll contact you when teams need players for a night.
> No season fee, no commitment.
>
> `[ Join the Sub List ]`

### Component

New client component `src/app/dashboard/pay-season/sub-list-offer.tsx`.

Props: `{ seasonId: number; activeWaiver: { id: number; content: string } | null }`

- The button opens a shadcn `Dialog` containing `WaiverContent`, an "I Agree"
  checkbox, and a confirm button disabled until agreed. This mirrors the
  structure of `src/app/dashboard/waitlist-button.tsx` rather than reusing it —
  that component is laid out for an always-visible dashboard panel.
- Submit calls the existing `expressWaitlistInterest(seasonId, waiverId, true)`
  server action.
- Success: `toast.success(result.message)`, then `router.push("/dashboard")` and
  `router.refresh()`. The dashboard already renders the "You've expressed
  interest — we'll reach out if a spot opens up" panel.
- Failure: `toast.error(result.message)`, dialog stays open for retry.
- `activeWaiver === null`: render nothing. There is no way to capture consent,
  and the wizard's waivers tab already surfaces the missing-waiver message.
- Local `isSubmitting` state disables the confirm button against double-submit.

### Wiring

In `src/app/dashboard/pay-season/wizard-form.tsx`, the three inline warning
conditions are lifted into named constants used by both the banners and one new
guard:

```tsx
{(missingAllTryouts || missingManyDates || missingAllPlayoffs) && (
    <SubListOffer seasonId={config.seasonId} activeWaiver={activeWaiver} />
)}
```

`WizardForm` already receives `config: SeasonConfig`, whose `seasonId` is a
non-nullable `number`, so no new prop threading from `page.tsx` is required.

### Server side

No changes. `expressWaitlistInterest` in
`src/app/dashboard/roster-actions.ts` is gated by `requireSession()` only — not
by "signups are closed" — so it is callable mid-wizard. Reusing it keeps waiver
acceptance recording and audit logging identical across both entry points.

## Edge cases

- **Already on the sub list.** The action returns "You've already expressed
  interest for this season." (backed by the `waitlist_season_user_uniq` index).
  Surfaced as an error toast. We deliberately do not pre-fetch waitlist
  membership to hide the CTA: that adds a query to every wizard render for a
  rare case that is already handled correctly.
- **Stale waiver.** If a new waiver is published while the dialog is open, the
  action's `activeWaiver.id !== waiverId` check returns the "waiver was updated,
  please reload" failure. Error toast; dialog stays open.
- **Discarded availability selections.** Joining the sub list drops the checked
  unavailable dates. The `waitlist` table has no availability columns
  (`id, season, user, approved, created_at`). This is accepted: the sub list is
  a "contact me when needed" list, not a scheduled roster.

## Testing

- **Integration** (`roster-actions.integration.test.ts`, which currently has no
  coverage for this action): happy path inserts a `waitlist` row and records
  waiver acceptance; unauthenticated returns
  `{ status: false, message: "Unauthorized." }`; duplicate join fails;
  mismatched `waiverId` fails; `waiverAgreed: false` fails.
- **Unit**: the three warning predicates, extracted as pure helpers, pinning the
  thresholds (all tryouts / >= 4 dates / all playoffs) that decide whether the
  offer appears at all.
- **No E2E.** The wizard's payment tab requires Square; a Playwright run through
  this flow would be more setup than the change warrants.
