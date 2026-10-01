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

export const getCachedSeasonConfig: () => Promise<SeasonConfig> =
    unstable_cache(() => getSeasonConfig(), ["season-config"], {
        revalidate: PUBLIC_CACHE_SECONDS,
        tags: [SEASON_CONFIG_TAG]
    })

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
