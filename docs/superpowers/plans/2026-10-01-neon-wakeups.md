# Neon Wake-Up Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop automated traffic (calendar pollers, crawlers, ISR regeneration, session polling) from waking the Neon compute every few minutes, so scale-to-zero actually keeps it asleep overnight.

**Architecture:** Public, unauthenticated reads move behind `unstable_cache` wrappers that live in `src/next/` (the Next.js glue layer; `src/lib` must stay framework-free). Each cache entry is tagged, and the server actions that mutate the underlying rows call `revalidateTag(tag, "max")` next to their existing `revalidatePath` calls. The homepage stops calling `headers()`/`getSession` so it can be ISR-rendered like the other marketing pages; the signed-in redirect moves to `src/proxy.ts`, which already does cookie-only checks without a database round trip. better-auth gains a short-lived signed cookie cache so `get-session` polling stops hitting Postgres.

**Tech Stack:** Next.js 16.2.4 (`unstable_cache`, `revalidateTag(tag, "max")`), better-auth 1.6.5, Vitest (unit + integration), Playwright e2e, Biome.

**Spec:** The investigation write-up in this session (summarised in `~/.claude/projects/-home-kasm-user-src-bsd-site-nextjs/memory/neon-cost-investigation-2026-10-01.md`). Measured facts: the Neon compute suspends correctly since the 2026-09-07 health fix but is re-woken 40–90 times a day and is awake ~18 h/day; overnight wakers are `/api/calendar/[token]/[kind]` (~10 hits/hour), hourly per-page ISR regeneration of ~10 marketing pages (each reads season config from the DB), the fully-dynamic homepage, and `/api/auth/get-session`. The Launch plan cannot shorten the fixed 5-minute suspend timeout, so the only lever is fewer DB touches.

## Global Constraints

- pnpm only. Never `npm install`.
- Biome formatting: 4-space indent, no semicolons, no trailing commas. `pnpm lint` must pass (CI fails on unused imports). Run `pnpm exec biome check --write <changed files>` before `pnpm lint` to fix formatting and import order automatically; fix unused imports by hand.
- `src/lib`, `src/database`, `src/config` must not import `next/*`, `@/next/*`, `@/app/*`, `@/components/*`. Everything that imports `next/cache` in this plan lives in `src/next/` or `src/app/`.
- In Next 16.2.4 `revalidateTag` has the signature `revalidateTag(tag: string, profile: string | CacheLifeConfig)`; the second argument is required. Always call it as `revalidateTag(TAG, "max")`.
- The integration test setup (`src/test/setup.integration.ts`) mocks `next/cache` as `{ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn) => fn, unstable_noStore: () => {} }`. Integration tests therefore exercise the real loaders with the cache bypassed, and can assert on `revalidateTag` via `vi.mocked(revalidateTag)`.
- The unit test project aliases `@/database/db` to a guard that throws on any access.
- Before every commit run `git diff --cached --stat` first: other sessions sometimes pre-stage changes in this shared checkout, and they must not ride along. Commit only the files named in the task.
- Commit after each task. Push to `main` only in the final task, after lint and typecheck pass.
- Do not change the Neon endpoint settings or `vercel.json`.

---

### Task 1: Cache the calendar subscription feeds

**Files:**
- Create: `src/next/calendar-feed-cache.ts`
- Modify: `src/app/api/calendar/[token]/[kind]/route.ts`
- Modify: `src/app/dashboard/calendar-actions.ts`
- Test: `src/app/api/calendar/[token]/[kind]/route.integration.test.ts`
- Test: `src/app/dashboard/calendar-actions.integration.test.ts`

**Interfaces:**
- Consumes: `findUserIdByCalendarToken(token): Promise<string | null>` (`src/lib/calendar-token.ts`), `getSeasonConfig(): Promise<SeasonConfig>` (`src/lib/site-config.ts`), `buildCalendar(kind, userId, seasonId): Promise<{ ics: string; filename: string } | null>` and `emptyCalendar(kind): string` (`src/lib/calendar-feed.ts`), `CalendarKind` (`src/lib/calendar-links.ts`).
- Produces: `CALENDAR_FEED_TAG = "calendar-feeds"` and `getCachedCalendarFeed(token: string, kind: CalendarKind): Promise<{ ics: string; filename: string } | null>` in `src/next/calendar-feed-cache.ts`. Null means "no such token" (404).

Why this shape: Google, Apple and Outlook poll every subscribed feed roughly hourly, around the clock, and each poll currently runs three database reads. Caching the finished `.ics` per `(token, kind)` for an hour means a feed costs one database touch per hour instead of one per poll, and the `public, s-maxage` header lets Vercel's CDN answer repeat polls without even invoking the function. The token is the whole URL, so per-URL caching leaks nothing that the URL did not already grant. A rotated token must stop working immediately, so the reset action invalidates the tag.

- [ ] **Step 1: Write the failing integration tests**

Append to `src/app/api/calendar/[token]/[kind]/route.integration.test.ts`, inside the existing top-level `describe` (after the "stops serving a rotated token" test):

```ts
    it("lets the CDN cache a feed for an hour", async () => {
        const user = await createUser()
        const token = await getOrCreateCalendarToken(user.id)
        const res = await get(token, "personal.ics")
        expect(res.status).toBe(200)
        expect(res.headers.get("Cache-Control")).toBe(
            "public, s-maxage=3600, stale-while-revalidate=3600"
        )
    })

    it("does not let the CDN cache a 404", async () => {
        const res = await get("A".repeat(43), "personal.ics")
        expect(res.status).toBe(404)
        expect(res.headers.get("Cache-Control")).toBe("no-store")
    })
```

Append to `src/app/dashboard/calendar-actions.integration.test.ts` inside `describe("resetCalendarToken", ...)`. Add these imports at the top of the file:

```ts
import { revalidateTag } from "next/cache"
import { vi } from "vitest"
import { CALENDAR_FEED_TAG } from "@/next/calendar-feed-cache"
```

(If `vi` is already imported from vitest, extend that import instead of adding a second one.) Then the test:

```ts
    it("invalidates cached feeds so the old token stops resolving", async () => {
        await loginAs(await createUser())
        vi.mocked(revalidateTag).mockClear()
        const result = await resetCalendarToken()
        expect(result.status).toBe(true)
        expect(revalidateTag).toHaveBeenCalledWith(CALENDAR_FEED_TAG, "max")
    })
```

Check how the existing tests in that file log a user in (they use helpers from `@/test/session`; copy the exact pattern the sibling tests use for the signed-in case, e.g. `loginAs(user)` after `createUser()`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration -- "src/app/api/calendar" "src/app/dashboard/calendar-actions"`
Expected: the two new route tests fail on the `Cache-Control` value (`private, max-age=300` vs expected), the action test fails because `revalidateTag` was never called and `@/next/calendar-feed-cache` cannot be resolved.

- [ ] **Step 3: Create the cache module**

Create `src/next/calendar-feed-cache.ts`:

```ts
import { unstable_cache } from "next/cache"
import { buildCalendar, emptyCalendar } from "@/lib/calendar-feed"
import type { CalendarKind } from "@/lib/calendar-links"
import { findUserIdByCalendarToken } from "@/lib/calendar-token"
import { getSeasonConfig } from "@/lib/site-config"

// ---------------------------------------------------------------------------
// Calendar apps poll every subscribed feed about hourly, day and night, and
// every poll used to run three database reads. With the Neon compute on a
// 5-minute scale-to-zero timer that polling alone kept it awake. The finished
// .ics is cached per (token, kind) for an hour; rotating a token revalidates
// the tag so an old URL stops resolving at once. Lives in src/next because
// src/lib must not import next/cache.
// ---------------------------------------------------------------------------

export const CALENDAR_FEED_TAG = "calendar-feeds"
export const CALENDAR_FEED_MAX_AGE_SECONDS = 3600

export interface CachedCalendarFeed {
    ics: string
    filename: string
}

async function loadCalendarFeed(
    token: string,
    kind: CalendarKind
): Promise<CachedCalendarFeed | null> {
    const userId = await findUserIdByCalendarToken(token)
    if (!userId) return null

    const config = await getSeasonConfig()
    if (!config.seasonId) {
        // Between seasons: a valid empty calendar keeps subscribed clients
        // from flagging the feed as broken.
        return { ics: emptyCalendar(kind), filename: `bsd-${kind}.ics` }
    }

    const calendar = await buildCalendar(kind, userId, config.seasonId)
    return calendar ? { ics: calendar.ics, filename: calendar.filename } : null
}

export const getCachedCalendarFeed = unstable_cache(
    loadCalendarFeed,
    ["calendar-feed"],
    { revalidate: CALENDAR_FEED_MAX_AGE_SECONDS, tags: [CALENDAR_FEED_TAG] }
)
```

- [ ] **Step 4: Use it from the route**

Replace the body of `GET` in `src/app/api/calendar/[token]/[kind]/route.ts` and prune the imports. The full file after the change:

```ts
import { type NextRequest, NextResponse } from "next/server"
import { type CalendarKind, isCalendarKind } from "@/lib/calendar-links"
import {
    CALENDAR_FEED_MAX_AGE_SECONDS,
    getCachedCalendarFeed
} from "@/next/calendar-feed-cache"

export const runtime = "nodejs"

// 32 random bytes base64url-encoded is 43 chars; allow some slack but reject
// anything that obviously isn't one of ours before touching the database.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/

function notFound(): NextResponse {
    return new NextResponse("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" }
    })
}

function parseKind(segment: string): CalendarKind | null {
    if (!segment.endsWith(".ics")) return null
    const kind = segment.slice(0, -".ics".length)
    return isCalendarKind(kind) ? kind : null
}

/**
 * Public iCalendar subscription feed. The token in the path is the whole
 * credential — calendar apps fetch with no session — so every failure is a
 * bare 404 and nothing distinguishes "bad token" from "bad path".
 *
 * The feed body comes from getCachedCalendarFeed (one database build per
 * token per hour) and the public s-maxage lets Vercel's CDN answer repeat
 * polls without invoking this function at all. Both exist to keep calendar
 * pollers from waking the Neon compute every few minutes overnight.
 *
 * Infra note: the fetchers (Google-Calendar-Importer, Apple dataaccessd,
 * Outlook) are not browsers and cannot pass a JS challenge, so the Vercel
 * WAF has a custom "Calendar feeds bypass" rule (GET /api/calendar/*) placed
 * above the geo rule and the Bot Protection managed ruleset. Without it the
 * feed is 429-challenged and subscribed calendars silently stay empty.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ token: string; kind: string }> }
) {
    const { token, kind: kindSegment } = await params
    const kind = parseKind(kindSegment)
    if (!kind || !TOKEN_SHAPE.test(token)) return notFound()

    const feed = await getCachedCalendarFeed(token, kind)
    if (!feed) return notFound()

    return new NextResponse(feed.ics, {
        status: 200,
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `inline; filename="${feed.filename}"`,
            "Cache-Control": `public, s-maxage=${CALENDAR_FEED_MAX_AGE_SECONDS}, stale-while-revalidate=${CALENDAR_FEED_MAX_AGE_SECONDS}`
        }
    })
}
```

- [ ] **Step 5: Invalidate on token reset**

In `src/app/dashboard/calendar-actions.ts` add the imports:

```ts
import { revalidateTag } from "next/cache"
import { CALENDAR_FEED_TAG } from "@/next/calendar-feed-cache"
```

and in `resetCalendarToken`, immediately after `const token = await rotateCalendarToken(session.user.id)`:

```ts
        // The old URL is cached for up to an hour; drop it now so a reset
        // actually locks out whoever had the previous link.
        revalidateTag(CALENDAR_FEED_TAG, "max")
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:integration -- "src/app/api/calendar" "src/app/dashboard/calendar-actions"`
Expected: all tests in both files PASS, including the pre-existing "stops serving a rotated token" (the integration mock makes `unstable_cache` a pass-through, so the real lookups run).

- [ ] **Step 7: Lint, typecheck, commit**

Run: `pnpm lint && pnpm check-types`
Expected: both clean.

```bash
git diff --cached --stat   # must be empty before staging
git add src/next/calendar-feed-cache.ts "src/app/api/calendar/[token]/[kind]/route.ts" "src/app/api/calendar/[token]/[kind]/route.integration.test.ts" src/app/dashboard/calendar-actions.ts src/app/dashboard/calendar-actions.integration.test.ts
git commit -m "perf(calendar): cache subscription feeds for an hour

Calendar apps poll every feed about hourly around the clock and each poll
ran three database reads, which alone re-woke the Neon compute every few
minutes. The built .ics is now cached per (token, kind) with a public
s-maxage so the CDN absorbs repeat polls; resetting a token revalidates
the tag so the old link stops at once."
```

---

### Task 2: One cached read of season, tournament and sponsor data for every public page

**Files:**
- Create: `src/next/public-cache.ts`
- Modify: `src/app/(marketing)/layout.tsx`
- Modify: `src/app/(marketing)/sponsors/page.tsx`
- Modify: `src/app/(marketing)/season-info/page.tsx` (two `getSeasonConfig()` calls, lines 11 and 115)
- Modify: `src/components/layout/sections/sponsors-strip.tsx` (lines 29–31)
- Modify: `src/components/layout/sections/footer.tsx` (line 70)
- Modify: `src/app/dashboard/season-config/actions.ts` (revalidation block near line 427)
- Modify: `src/app/dashboard/season-control/actions.ts` (revalidation blocks near lines 245, 300, 469)
- Modify: `src/app/dashboard/configure-tryout-jobs/actions.ts` (revalidation blocks near lines 399, 558)
- Modify: `src/app/dashboard/tournament-config/actions.ts` (revalidation block near line 363)
- Modify: `src/app/dashboard/manage-sponsors/actions.ts` (revalidation block near line 78)
- Modify: `src/app/dashboard/sponsorship/actions.ts` (revalidation block near line 43)
- Test: `src/next/public-cache.test.ts`

**Interfaces:**
- Consumes: `getSeasonConfig(): Promise<SeasonConfig>` (`src/lib/site-config.ts`), `getTournamentConfig(): Promise<TournamentConfig | null>` (`src/lib/tournament-config.ts`), `getPublicSponsors(seasonId: number): Promise<PublicSponsor[]>` (`src/lib/sponsors.ts`).
- Produces (in `src/next/public-cache.ts`): `SEASON_CONFIG_TAG = "season-config"`, `TOURNAMENT_CONFIG_TAG = "tournament-config"`, `PUBLIC_SPONSORS_TAG = "public-sponsors"`, `PUBLIC_CACHE_SECONDS = 3600`, `getCachedSeasonConfig(): Promise<SeasonConfig>`, `getCachedTournamentConfig(): Promise<TournamentConfig | null>`, `getCachedPublicSponsors(seasonId: number): Promise<PublicSponsor[]>`. Task 3 uses the first two from the homepage.

Why: the marketing layout's `export const revalidate = 3600` is applied per route, so ten public pages each regenerate once an hour and each regeneration reads the season config from Postgres. Behind one tagged `unstable_cache` entry, all of them share a single hourly read. Tag invalidation from the mutating actions keeps the existing "a season change shows up immediately" behaviour that the layout comment promises. Only `src/next` and `src/app` may import `next/cache`, which is why the wrappers do not go in `src/lib`.

- [ ] **Step 1: Write the failing unit test**

Create `src/next/public-cache.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

// The unit project aliases @/database/db to a guard that throws, so these
// tests prove the wrappers delegate to the lib loaders (mocked here) rather
// than reaching the database themselves, and that the cache keys/tags are
// the ones the mutating actions revalidate.

// vi.mock calls are hoisted above every import, so anything a factory
// touches must come from vi.hoisted.
const { unstableCache, seasonConfig, tournamentConfig, sponsors } = vi.hoisted(
    () => ({
        unstableCache: vi.fn(
            (
                fn: (...args: unknown[]) => unknown,
                keyParts: string[],
                options: unknown
            ) =>
                Object.assign((...args: unknown[]) => fn(...args), {
                    keyParts,
                    options
                })
        ),
        seasonConfig: { seasonId: 7, seasonName: "Fall", events: [] },
        tournamentConfig: { tournamentId: 3, code: "T26" },
        sponsors: [{ name: "Acme", logoUrl: null }]
    })
)
vi.mock("next/cache", () => ({ unstable_cache: unstableCache }))
vi.mock("@/lib/site-config", () => ({
    getSeasonConfig: vi.fn(async () => seasonConfig)
}))
vi.mock("@/lib/tournament-config", () => ({
    getTournamentConfig: vi.fn(async () => tournamentConfig)
}))
vi.mock("@/lib/sponsors", () => ({
    getPublicSponsors: vi.fn(async (seasonId: number) =>
        seasonId === 7 ? sponsors : []
    )
}))

describe("public-cache", () => {
    it("wraps each loader in a tagged hourly cache entry", async () => {
        const mod = await import("./public-cache")
        const entries = unstableCache.mock.calls.map(([, keyParts, options]) => ({
            keyParts,
            options
        }))
        expect(entries).toEqual(
            expect.arrayContaining([
                {
                    keyParts: ["season-config"],
                    options: { revalidate: 3600, tags: [mod.SEASON_CONFIG_TAG] }
                },
                {
                    keyParts: ["tournament-config"],
                    options: {
                        revalidate: 3600,
                        tags: [mod.TOURNAMENT_CONFIG_TAG]
                    }
                },
                {
                    keyParts: ["public-sponsors"],
                    options: { revalidate: 3600, tags: [mod.PUBLIC_SPONSORS_TAG] }
                }
            ])
        )
    })

    it("delegates to the lib loaders", async () => {
        const mod = await import("./public-cache")
        expect(await mod.getCachedSeasonConfig()).toEqual(seasonConfig)
        expect(await mod.getCachedTournamentConfig()).toEqual(tournamentConfig)
        expect(await mod.getCachedPublicSponsors(7)).toEqual(sponsors)
        expect(await mod.getCachedPublicSponsors(8)).toEqual([])
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- src/next/public-cache.test.ts`
Expected: FAIL, cannot resolve `./public-cache`.

- [ ] **Step 3: Create the module**

Create `src/next/public-cache.ts`:

```ts
import { unstable_cache } from "next/cache"
import type { SeasonConfig } from "@/lib/season-types"
import { getSeasonConfig } from "@/lib/site-config"
import { type PublicSponsor, getPublicSponsors } from "@/lib/sponsors"
import {
    type TournamentConfig,
    getTournamentConfig
} from "@/lib/tournament-config"

// ---------------------------------------------------------------------------
// Reads that public (unauthenticated) pages make. Each marketing route is
// ISR-regenerated on its own hourly clock, so without a shared entry ten
// pages meant ten database reads an hour, every hour, which kept the Neon
// compute from scaling to zero. One tagged entry per loader serves all of
// them; the server actions that change the rows call revalidateTag(tag,
// "max") beside their revalidatePath calls so a change still shows at once.
// Lives in src/next because src/lib must not import next/cache.
// ---------------------------------------------------------------------------

export const PUBLIC_CACHE_SECONDS = 3600

export const SEASON_CONFIG_TAG = "season-config"
export const TOURNAMENT_CONFIG_TAG = "tournament-config"
export const PUBLIC_SPONSORS_TAG = "public-sponsors"

export const getCachedSeasonConfig: () => Promise<SeasonConfig> = unstable_cache(
    () => getSeasonConfig(),
    ["season-config"],
    { revalidate: PUBLIC_CACHE_SECONDS, tags: [SEASON_CONFIG_TAG] }
)

export const getCachedTournamentConfig: () => Promise<TournamentConfig | null> =
    unstable_cache(() => getTournamentConfig(), ["tournament-config"], {
        revalidate: PUBLIC_CACHE_SECONDS,
        tags: [TOURNAMENT_CONFIG_TAG]
    })

export const getCachedPublicSponsors: (
    seasonId: number
) => Promise<PublicSponsor[]> = unstable_cache(
    (seasonId: number) => getPublicSponsors(seasonId),
    ["public-sponsors"],
    { revalidate: PUBLIC_CACHE_SECONDS, tags: [PUBLIC_SPONSORS_TAG] }
)
```

If `PublicSponsor` is not exported from `src/lib/sponsors.ts`, export the existing interface there (add `export` to its declaration) rather than redefining it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- src/next/public-cache.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Switch the public callers**

`src/app/(marketing)/layout.tsx`: change the import and call.

```ts
import { Navbar } from "@/components/layout/navbar"
import { FooterSection } from "@/components/layout/sections/footer"
import { formatSeasonLabel } from "@/lib/site-config"
import { getCachedSeasonConfig } from "@/next/public-cache"

// The navbar/footer season label is read through the shared public cache
// (one DB read an hour for every marketing page together). Revalidate hourly
// so marketing pages pick up a season change without a redeploy;
// season-affecting mutations also revalidate the cache tag and paths.
export const revalidate = 3600

export default async function MarketingLayout({
    children
}: {
    children: React.ReactNode
}) {
    const config = await getCachedSeasonConfig()
    const seasonLabel = formatSeasonLabel(config)

    return (
        <>
            <Navbar seasonLabel={seasonLabel} />
            {children}
            <FooterSection />
        </>
    )
}
```

`src/app/(marketing)/sponsors/page.tsx`: replace the import line `import { formatSeasonLabel, getSeasonConfig } from "@/lib/site-config"` with

```ts
import { formatSeasonLabel } from "@/lib/site-config"
import { getCachedPublicSponsors, getCachedSeasonConfig } from "@/next/public-cache"
```

remove the `import { getPublicSponsors } from "@/lib/sponsors"` line, and change the two calls to `getCachedSeasonConfig()` and `getCachedPublicSponsors(config.seasonId)`.

`src/app/(marketing)/season-info/page.tsx`: both `getSeasonConfig()` calls become `getCachedSeasonConfig()`; import it from `@/next/public-cache` and drop `getSeasonConfig` from the `@/lib/site-config` import if nothing else there uses it.

`src/components/layout/sections/sponsors-strip.tsx`: replace the two lib imports with

```ts
import { formatSeasonLabel } from "@/lib/site-config"
import { getCachedPublicSponsors, getCachedSeasonConfig } from "@/next/public-cache"
```

and change the calls at lines 29–31 to `getCachedSeasonConfig()` / `getCachedPublicSponsors(config.seasonId)`.

`src/components/layout/sections/footer.tsx`: line 70 `getSeasonConfig()` becomes `getCachedSeasonConfig()`; import from `@/next/public-cache` and drop the now-unused lib import.

Then confirm no public surface still reads the lib loaders directly:

Run: `grep -rn "getSeasonConfig()\|getTournamentConfig()\|getPublicSponsors(" "src/app/(marketing)" src/components/layout`
Expected: only `src/app/(marketing)/page.tsx` (handled in Task 3).

- [ ] **Step 6: Revalidate the tags from the mutating actions**

In each file below, extend the existing `import { revalidatePath } from "next/cache"` to `import { revalidatePath, revalidateTag } from "next/cache"`, add the tag import, and add the `revalidateTag` call directly after the last `revalidatePath` call of each listed block.

`src/app/dashboard/season-config/actions.ts` (block near line 427):

```ts
import { SEASON_CONFIG_TAG } from "@/next/public-cache"
...
            revalidatePath("/season-info")
            revalidateTag(SEASON_CONFIG_TAG, "max")
```

`src/app/dashboard/season-control/actions.ts`: same import; add `revalidateTag(SEASON_CONFIG_TAG, "max")` after each of the three blocks (the ones ending near lines 245, 300 and 474). Every action in this file that writes `seasons` rows must revalidate the tag; read the file and confirm each `revalidatePath("/dashboard/season-control")` block belongs to a write.

`src/app/dashboard/configure-tryout-jobs/actions.ts`: same import; add `revalidateTag(SEASON_CONFIG_TAG, "max")` after the blocks ending near lines 400 and 559 (both actions update `seasonEvents`, which `getSeasonConfig()` reads).

`src/app/dashboard/tournament-config/actions.ts` (block near line 363):

```ts
import { TOURNAMENT_CONFIG_TAG } from "@/next/public-cache"
...
        revalidatePath("/dashboard")
        revalidateTag(TOURNAMENT_CONFIG_TAG, "max")
```

Read the whole file: if other exported actions in it write `tournaments` or `tournamentDivisions` and have their own `revalidatePath` block, add the same tag call there too.

`src/app/dashboard/manage-sponsors/actions.ts` (block near line 78) and `src/app/dashboard/sponsorship/actions.ts` (block near line 43):

```ts
import { PUBLIC_SPONSORS_TAG } from "@/next/public-cache"
...
    revalidatePath("/")
    revalidateTag(PUBLIC_SPONSORS_TAG, "max")
```

- [ ] **Step 7: Run the affected integration tests**

Run: `pnpm test:integration -- "src/app/dashboard/season-config" "src/app/dashboard/season-control" "src/app/dashboard/configure-tryout-jobs" "src/app/dashboard/tournament-config" "src/app/dashboard/manage-sponsors" "src/app/dashboard/sponsorship"`
Expected: PASS (the `next/cache` mock accepts the new calls). If a directory has no integration test file Vitest reports "No test files found" for that pattern, which is fine.

- [ ] **Step 8: Lint, typecheck, commit**

Run: `pnpm lint && pnpm check-types`
Expected: clean. A likely lint finding is an unused `getSeasonConfig` import left behind in one of the switched files; remove it.

```bash
git diff --cached --stat   # must be empty before staging
git add src/next/public-cache.ts src/next/public-cache.test.ts "src/app/(marketing)/layout.tsx" "src/app/(marketing)/sponsors/page.tsx" "src/app/(marketing)/season-info/page.tsx" src/components/layout/sections/sponsors-strip.tsx src/components/layout/sections/footer.tsx src/app/dashboard/season-config/actions.ts src/app/dashboard/season-control/actions.ts src/app/dashboard/configure-tryout-jobs/actions.ts src/app/dashboard/tournament-config/actions.ts src/app/dashboard/manage-sponsors/actions.ts src/app/dashboard/sponsorship/actions.ts
# plus src/lib/sponsors.ts if you had to export PublicSponsor
git commit -m "perf(marketing): share one cached season/tournament/sponsor read across public pages

Each marketing route regenerated on its own hourly clock and each
regeneration read the season config from Postgres, so ten pages meant ten
wake-ups an hour. The public pages now read through tagged unstable_cache
entries in src/next/public-cache.ts, and the actions that change seasons,
tournaments and sponsors revalidate the tags beside their revalidatePath
calls."
```

---

### Task 3: Make the homepage static again; move the signed-in redirect to the proxy

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/app/(marketing)/page.tsx` (lines 4, 13–14, 112–127)
- Test: `src/proxy.test.ts` (new)
- Existing coverage: `e2e/home-redirect.spec.ts` (unchanged; must still pass)

**Interfaces:**
- Consumes: `getCachedSeasonConfig`, `getCachedTournamentConfig` from `src/next/public-cache.ts` (Task 2); `getSessionCookie(request)` from `better-auth/cookies`.
- Produces: `proxy(request: NextRequest)` now also handles `/`.

Why: commit c084595 added "signed-in users land on their dashboard" by calling `headers()` and `auth.api.getSession` inside the page. Reading `headers()` or `searchParams` opts the route out of ISR, so every crawler hit on `/` renders live and reads season and tournament config from Postgres. `src/proxy.ts` already makes a cookie-only decision (no database) for `/dashboard`; the same check on `/` gives the redirect without the cost, and the page becomes an hourly ISR page like its siblings. The `?stay=1` escape hatch is honoured in the proxy, so the page no longer needs `searchParams` at all.

- [ ] **Step 1: Write the failing proxy unit test**

Create `src/proxy.test.ts`:

```ts
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { proxy } from "./proxy"

// better-auth's default (non-secure) cookie name; getSessionCookie only
// checks presence, so any value works.
const SESSION_COOKIE = "better-auth.session_token=abc"

function request(path: string, cookie?: string): NextRequest {
    return new NextRequest(`http://localhost:3000${path}`, {
        headers: cookie ? { cookie } : {}
    })
}

describe("proxy", () => {
    it("sends a signed-in visitor from the homepage to the dashboard", async () => {
        const res = await proxy(request("/", SESSION_COOKIE))
        expect(res.status).toBe(307)
        expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
            "/dashboard"
        )
    })

    it("lets a signed-in visitor stay on the homepage with ?stay=1", async () => {
        const res = await proxy(request("/?stay=1", SESSION_COOKIE))
        expect(res.headers.get("location")).toBeNull()
    })

    it("serves the homepage to a logged-out visitor", async () => {
        const res = await proxy(request("/"))
        expect(res.headers.get("location")).toBeNull()
    })

    it("still sends a logged-out visitor on a dashboard page to sign-in", async () => {
        const res = await proxy(request("/dashboard/rosters?week=2"))
        expect(res.status).toBe(307)
        const location = new URL(res.headers.get("location") ?? "")
        expect(location.pathname).toBe("/auth/sign-in")
        expect(location.searchParams.get("redirectTo")).toBe(
            "/dashboard/rosters?week=2"
        )
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- src/proxy.test.ts`
Expected: the first test FAILS (no redirect: the current proxy only knows the protected-route branch, and a signed-in request to `/` gets `NextResponse.next()`).

- [ ] **Step 3: Rewrite the proxy**

Replace `src/proxy.ts` with:

```ts
import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"

// Cookie-only decisions, no database. Pages re-check the real session.
//
// "/" is here so the homepage can stay a static (ISR) page: reading
// headers() or searchParams inside the page made every crawler hit render
// live and query Postgres, which kept the Neon compute from scaling to zero.
export async function proxy(request: NextRequest) {
    const sessionCookie = getSessionCookie(request)
    const { pathname, search, searchParams } = request.nextUrl

    if (pathname === "/") {
        // Signed-in users land on their dashboard instead of the marketing
        // page. Brand/logo links pass ?stay=1 so they can still view it.
        if (sessionCookie && searchParams.get("stay") !== "1") {
            return NextResponse.redirect(new URL("/dashboard", request.url))
        }
        return NextResponse.next()
    }

    // Protected routes: optimistic redirect when there is no session cookie.
    if (!sessionCookie) {
        const redirectTo = pathname + search
        return NextResponse.redirect(
            new URL(`/auth/sign-in?redirectTo=${redirectTo}`, request.url)
        )
    }

    return NextResponse.next()
}

export const config = {
    // "/" for the signed-in redirect; dashboard routes and auth settings
    // are protected.
    matcher: ["/", "/dashboard/:path*", "/auth/settings"]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- src/proxy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Strip the dynamic APIs from the homepage**

In `src/app/(marketing)/page.tsx`:

Remove these imports:

```ts
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
```

Change the `@/lib/site-config` and `@/lib/tournament-config` imports so the page no longer imports `getSeasonConfig` or `getTournamentConfig`:

```ts
import { formatSeasonLabel, getEventsByType } from "@/lib/site-config"
import { getCachedSeasonConfig, getCachedTournamentConfig } from "@/next/public-cache"
```

Replace the component signature and the first lines of its body (currently lines 112–127) with:

```ts
// Static (ISR, hourly via the marketing layout). The signed-in redirect and
// the ?stay=1 escape hatch live in src/proxy.ts so this page never reads
// headers() or searchParams, which would make every crawler hit render live.
export default async function Home() {
    const tournament = await getCachedTournamentConfig()
    const seasonConfig = await getCachedSeasonConfig()
    const seasonLabel = formatSeasonLabel(seasonConfig)
```

Everything from `// Registration banner:` onward stays as it is.

- [ ] **Step 6: Prove the route is no longer dynamic**

Run: `pnpm build 2>&1 | grep -E " /(faq|player-experience)?\s*$"`
Expected: three route-table rows. The `/` row carries the same static/ISR marker (`○` or `◐`/`●`) as `/faq` and `/player-experience`, not `ƒ` (Dynamic). If the grep matches nothing, run `pnpm build` again without the filter and read the "Route (app)" table by eye. If the build's first attempt fails with "Connection terminated unexpectedly" from Neon, re-run once (known first-connection flake after the compute has idled).

- [ ] **Step 7: Run the e2e redirect spec**

Preconditions (see AGENTS.md Testing): local Postgres cluster running (`sudo pg_ctlcluster 17 main start` if needed) and nothing else listening on port 3000.

Run: `pnpm test:e2e -- e2e/home-redirect.spec.ts`
Expected: 3 passed (logged-out sees homepage; signed-in player redirected to `/dashboard`; `?stay=1` keeps the homepage).

- [ ] **Step 8: Lint, typecheck, commit**

Run: `pnpm lint && pnpm check-types`
Expected: clean.

```bash
git diff --cached --stat   # must be empty before staging
git add src/proxy.ts src/proxy.test.ts "src/app/(marketing)/page.tsx"
git commit -m "perf(home): static homepage; signed-in redirect moves to the proxy

Reading headers() and searchParams in the page made / fully dynamic, so
every crawler hit rendered live and read season and tournament config
from Postgres. The cookie-only redirect (and ?stay=1) now live in
src/proxy.ts and the page reads through the shared public cache, so it is
an hourly ISR page like the rest of the marketing site."
```

---

### Task 4: Serve `get-session` from a signed cookie cache; document the new rules

**Files:**
- Modify: `src/lib/auth.ts` (session block, lines 26–29)
- Modify: `AGENTS.md` (Architecture and Security sections)
- Existing coverage: `e2e/home-redirect.spec.ts`, any `e2e/*auth*.spec.ts` or sign-in spec (unchanged; must still pass)

**Interfaces:**
- Consumes: better-auth 1.6.5 `session.cookieCache` option.
- Produces: nothing new in code; a documented operational rule.

Why: `authClient.useSession()` in `nav-user.tsx` and `redirect-to-home.tsx` calls `/api/auth/get-session` on every dashboard page load and on tab focus, including from an installed PWA on a phone overnight, and every call is a session-table lookup. With `cookieCache` enabled, better-auth stores a short-lived signed copy of the session in a cookie and answers `getSession` from it, both for the client endpoint and for server-side `auth.api.getSession`, until `maxAge` elapses.

Trade-off to state plainly in the docs: `invalidateAllSessionsForUser` (called on role changes) now takes up to `maxAge` to be felt by an already-signed-in browser. Authorization itself is unaffected because every role check reads `user_roles` live; only "is this person still signed in at all" can lag by up to five minutes.

- [ ] **Step 1: Enable the cookie cache**

In `src/lib/auth.ts` change the session block to:

```ts
    session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        updateAge: 60 * 60 * 24, // refresh the session daily
        // get-session is polled by every dashboard tab (and installed PWAs
        // overnight); answering from a short-lived signed cookie keeps that
        // polling from waking the Neon compute. Revocation of an active
        // session can lag by up to maxAge; role checks still hit user_roles.
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60
        }
    },
```

- [ ] **Step 2: Typecheck**

Run: `pnpm check-types`
Expected: clean. If `cookieCache` is rejected by the type, open `node_modules/better-auth/dist/types/index.d.ts` (or grep `cookieCache` under `node_modules/better-auth/dist`) and match the documented shape for 1.6.5 exactly; do not cast.

- [ ] **Step 3: Verify in a browser session**

Run: `pnpm test:e2e -- e2e/home-redirect.spec.ts` plus every spec whose name contains `auth`, `sign-in` or `login` under `e2e/` (list them with `ls e2e/*.spec.ts`).
Expected: all pass. Additionally start `pnpm dev`, sign in as any persona, and confirm in the browser devtools that the response to `/api/auth/get-session` sets a `better-auth.session_data` cookie (the cache cookie). Stop the dev server afterwards.

- [ ] **Step 4: Document the rules in AGENTS.md**

Under **Architecture and Coding Patterns**, after the bullet that starts "Prefer App Router server components for data loading.", add:

```markdown
- **Public pages must not read Postgres per request.** The Neon compute scales to zero after 5 idle minutes (not configurable on the Launch plan), so anything that queries on every hit from crawlers, calendar pollers or session polling keeps it awake. Marketing pages, the footer and the sponsors strip read season, tournament and sponsor data through the tagged `unstable_cache` wrappers in `src/next/public-cache.ts`; actions that change those rows call `revalidateTag(<TAG>, "max")` beside `revalidatePath`. Calendar feeds go through `src/next/calendar-feed-cache.ts` (hourly, CDN-cacheable; token reset revalidates the tag). The homepage stays static: its signed-in redirect lives in `src/proxy.ts`, never in the page. Do not add `headers()`, `cookies()` or `searchParams` to a marketing page.
```

Under **Security Patterns**, change the bullet "Role updates that change privilege should invalidate active sessions for the affected user (call `invalidateAllSessionsForUser`)." to:

```markdown
- Role updates that change privilege should invalidate active sessions for the affected user (call `invalidateAllSessionsForUser`). better-auth's `cookieCache` (5 minutes, `src/lib/auth.ts`) means an already-open browser can keep a revoked session for up to that long; authorization is unaffected because every permission check reads `user_roles` live.
```

- [ ] **Step 5: Lint and commit**

Run: `pnpm lint`
Expected: clean.

```bash
git diff --cached --stat   # must be empty before staging
git add src/lib/auth.ts AGENTS.md
git commit -m "perf(auth): answer get-session from a 5-minute signed cookie cache

Every dashboard tab and installed PWA polls /api/auth/get-session, and
each call was a session-table read that re-woke the Neon compute. The
cookie cache serves those from a signed cookie. Revocation of an active
session can now lag up to five minutes; role checks still read user_roles
live. AGENTS.md records the no-per-request-DB rule for public pages."
```

---

### Task 5: Full verification and push

**Files:** none new.

- [ ] **Step 1: Run the whole quality gate**

Run, in this order (lint last, because CI's lint gate is the one that catches unused imports):

```bash
pnpm check-types
pnpm test
pnpm lint
```

Expected: all three clean. `pnpm test` runs unit and integration projects; the integration project needs the local Postgres cluster.

- [ ] **Step 2: Confirm the public surfaces no longer read the lib loaders**

Run: `grep -rn "getSeasonConfig()\|getTournamentConfig()\|getPublicSponsors(" "src/app/(marketing)" src/components/layout src/app/api/calendar`
Expected: no output.

- [ ] **Step 3: Push**

```bash
git diff --cached --stat   # must be empty
git status                 # must be clean apart from untracked scratch files
git push origin main
```

- [ ] **Step 4: Record how to measure the result**

The proof is in the Neon operations log, not in the code. After the deploy has been live for a full night, run from the repo root (the API key is in `.env.local`):

```bash
set -a; . ./.env.local; set +a
curl -s -H "Authorization: Bearer $NEON_API_KEY" \
  "https://console.neon.tech/api/v2/projects/lucky-salad-47542847/operations?limit=1000" \
  | jq -r '.operations[] | select(.action=="start_compute") | .created_at[0:13]' \
  | sort | uniq -c
```

Before this work the compute started 40–90 times a day with wake-ups every hour of the night. Success looks like single-digit starts between 04:00 and 11:00 UTC. Report the counts in the final summary.
