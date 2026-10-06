import { PreviousSeasonsCard } from "../previous-seasons-card"
import { getPreviousSeasonsPlayed } from "../queries"

// Streams in below the cards (the page wraps it in <Suspense>).
export async function PreviousSeasonsSection({ userId }: { userId: string }) {
    const previousSeasons = await getPreviousSeasonsPlayed(userId)
    if (previousSeasons.length === 0) return null
    return <PreviousSeasonsCard previousSeasons={previousSeasons} />
}
