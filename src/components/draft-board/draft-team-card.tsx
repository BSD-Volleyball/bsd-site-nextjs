import { formatDisplayName } from "@/lib/utils"
import type { DraftPlayer, DraftTeam } from "@/lib/draft-results"

const ROUND_COLORS = [
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200"
]

function getRoundColor(round: number): string {
    return ROUND_COLORS[(round - 1) % ROUND_COLORS.length]
}

function DraftPickBubble({ player }: { player: DraftPlayer }) {
    return (
        <span
            className={`mr-2 inline-flex min-w-[70px] items-center justify-center rounded-full px-2 py-0.5 font-semibold text-xs ${getRoundColor(player.round)}`}
        >
            R{player.round} ({player.overall})
        </span>
    )
}

function DraftTeamCard({
    team,
    onPlayerClick
}: {
    team: DraftTeam
    onPlayerClick: (userId: string) => void
}) {
    const captainName = formatDisplayName(
        team.captainFirstName,
        team.captainLastName,
        team.captainPreferredName
    )

    return (
        <div className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-2">
                    {team.teamNumber != null && (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-sm">
                            {team.teamNumber}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => onPlayerClick(team.captainId)}
                        className="font-semibold text-lg hover:underline focus:outline-none"
                    >
                        {captainName}
                    </button>
                    <span className="text-muted-foreground text-sm">
                        — {team.teamName}
                    </span>
                </div>
            </div>
            <div className="divide-y">
                {team.players.length === 0 ? (
                    <p className="px-4 py-3 text-muted-foreground text-sm">
                        No draft picks recorded
                    </p>
                ) : (
                    team.players.map((player) => (
                        <div
                            key={`${player.round}-${player.overall}`}
                            className="flex items-center px-4 py-2 transition-colors hover:bg-accent/50"
                        >
                            <DraftPickBubble player={player} />
                            <button
                                type="button"
                                onClick={() => onPlayerClick(player.userId)}
                                className="font-medium text-sm hover:underline focus:outline-none"
                            >
                                {formatDisplayName(
                                    player.firstName,
                                    player.lastName,
                                    player.preferredName
                                )}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

/** The teams of one division's draft, one card per team, picks in order. */
export function DraftTeamGrid({
    teams,
    onPlayerClick
}: {
    teams: DraftTeam[]
    onPlayerClick: (userId: string) => void
}) {
    return (
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
                <DraftTeamCard
                    key={team.teamId}
                    team={team}
                    onPlayerClick={onPlayerClick}
                />
            ))}
        </div>
    )
}
