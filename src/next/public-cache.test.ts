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
        const entries = unstableCache.mock.calls.map(
            ([, keyParts, options]) => ({
                keyParts,
                options
            })
        )
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
                    options: {
                        revalidate: 3600,
                        tags: [mod.PUBLIC_SPONSORS_TAG]
                    }
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
