import "server-only"
import { z } from "zod"

// Validated server-side environment access. Parsed lazily on first use so
// importing this module never fails at build time; a malformed value fails
// loudly with a zod error naming the variable instead of silently producing
// broken URLs. Add new variables here instead of reading process.env inline.

const serverEnvSchema = z.object({
    // Public base URL for player/team pictures (R2 bucket). Optional — when
    // unset, picture paths render relative and images degrade gracefully.
    PLAYER_PIC_URL: z.string().trim().url().or(z.literal("")).default("")
})

type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | null = null

function serverEnv(): ServerEnv {
    if (!cached) {
        cached = serverEnvSchema.parse(process.env)
    }
    return cached
}

/** Base URL for player pictures, "" when unconfigured. Pair with buildPlayerPictureUrl(). */
export function playerPicBaseUrl(): string {
    return serverEnv().PLAYER_PIC_URL
}
