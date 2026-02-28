import type {
    PlayerRatingAverages,
    PlayerRatingPrivateNote,
    PlayerRatingSharedNote
} from "@/lib/player-ratings-shared"

interface PlayerRatingsSectionProps {
    ratingAverages: PlayerRatingAverages
    sharedRatingNotes: PlayerRatingSharedNote[]
    privateRatingNotes: PlayerRatingPrivateNote[]
}

const divisionByScore: Record<number, string> = {
    0: "Unrated",
    1: "BB",
    2: "BBB",
    3: "ABB",
    4: "ABA",
    5: "A",
    6: "AA"
}

function formatRatingValue(value: number | null): string {
    if (value === null) {
        return "—"
    }

    const rounded = Math.max(0, Math.min(6, Math.round(value)))
    const division = divisionByScore[rounded] || "Unrated"
    return `${division} (${value.toFixed(1)})`
}

export function PlayerRatingsSection({
    ratingAverages,
    sharedRatingNotes,
    privateRatingNotes
}: PlayerRatingsSectionProps) {
    const hasAnyAverage =
        ratingAverages.overall !== null ||
        ratingAverages.passing !== null ||
        ratingAverages.setting !== null ||
        ratingAverages.hitting !== null ||
        ratingAverages.serving !== null

    return (
        <div>
            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                Player Ratings
            </h3>

            {ratingAverages.seasonLabels.length > 0 && (
                <p className="mb-3 text-muted-foreground text-xs">
                    Seasons: {ratingAverages.seasonLabels.join(", ")}
                </p>
            )}

            {hasAnyAverage ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <span className="text-muted-foreground">Overall:</span>
                        <span className="ml-2 font-medium">
                            {formatRatingValue(ratingAverages.overall)}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Ratings:</span>
                        <span className="ml-2 font-medium">
                            {ratingAverages.sampleCount}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Passing:</span>
                        <span className="ml-2 font-medium">
                            {formatRatingValue(ratingAverages.passing)}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Setting:</span>
                        <span className="ml-2 font-medium">
                            {formatRatingValue(ratingAverages.setting)}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Hitting:</span>
                        <span className="ml-2 font-medium">
                            {formatRatingValue(ratingAverages.hitting)}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Serving:</span>
                        <span className="ml-2 font-medium">
                            {formatRatingValue(ratingAverages.serving)}
                        </span>
                    </div>
                </div>
            ) : (
                <p className="text-muted-foreground text-sm">
                    No ratings found for previous seasons.
                </p>
            )}

            <div className="mt-4 space-y-2">
                <p className="font-semibold text-sm">Shared Notes</p>
                {sharedRatingNotes.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No shared notes found.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {sharedRatingNotes.map((note, index) => (
                            <div
                                key={`${note.evaluatorId}-${note.updatedAt}-${index}`}
                            >
                                <p className="text-sm">{note.note}</p>
                                <p className="text-muted-foreground text-xs">
                                    {note.seasonLabel} • {note.evaluatorName}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {privateRatingNotes.length > 0 && (
                <div className="mt-4 space-y-2">
                    <p className="font-semibold text-sm">Private Notes</p>
                    <div className="space-y-2">
                        {privateRatingNotes.map((note, index) => (
                            <div
                                key={`${note.evaluatorId}-${note.updatedAt}-${index}`}
                            >
                                <p className="text-sm">{note.note}</p>
                                <p className="text-muted-foreground text-xs">
                                    {note.seasonLabel} • {note.evaluatorName}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
