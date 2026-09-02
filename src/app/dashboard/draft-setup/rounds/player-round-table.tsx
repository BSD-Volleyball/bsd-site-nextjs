"use client"

import { useEffect, useRef } from "react"
import type { PlayerRow, PrepareForDraftData } from "./actions"
import { clampRound, getRoundClass } from "./draft-round-utils"

function PlayerTableRow({
    player,
    isCaptain,
    setRound,
    onSetRound,
    onOpenDetail
}: {
    player: PlayerRow
    isCaptain: boolean
    setRound?: number
    onSetRound?: (v: number) => void
    onOpenDetail: (userId: string) => void
}) {
    const rowClass = isCaptain
        ? "border-t bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60"
        : player.isPairPick
          ? "border-t bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-950/60"
          : "border-t hover:bg-muted/30"
    const stickyBg = isCaptain
        ? "bg-blue-50 dark:bg-blue-950/40"
        : player.isPairPick
          ? "bg-violet-50 dark:bg-violet-950/40"
          : "bg-background"

    return (
        <tr className={rowClass}>
            <td
                className={`sticky left-0 z-10 whitespace-nowrap border-r px-3 py-2 font-medium ${stickyBg}`}
            >
                <button
                    type="button"
                    onClick={() => onOpenDetail(player.userId)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                    {player.displayName} {player.lastName}
                </button>
                {player.isPairPick && (
                    <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 font-semibold text-violet-700 text-xs dark:bg-violet-900/40 dark:text-violet-300">
                        PP
                    </span>
                )}
                {isCaptain && (
                    <span className="ml-1.5 rounded bg-blue-100 px-1 py-0.5 font-semibold text-blue-700 text-xs dark:bg-blue-900/40 dark:text-blue-300">
                        CAP
                    </span>
                )}
            </td>
            {player.teamRounds.map((tr) => (
                <td
                    key={tr.teamId}
                    className={`px-3 py-2 text-center ${getRoundClass(tr.mappedRound)}`}
                >
                    {tr.mappedRound >= 9 ? (
                        <span className="text-muted-foreground">
                            {tr.teamCompletedHomework ? "— (9)" : "—"}
                        </span>
                    ) : (
                        tr.mappedRound.toFixed(1)
                    )}
                </td>
            ))}
            <td className="px-3 py-2 text-center tabular-nums">
                {player.captainAverage.toFixed(1)}
            </td>
            <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">
                {player.draftHistoryAverage !== null
                    ? player.draftHistoryAverage.toFixed(1)
                    : "—"}
            </td>
            <td className="px-3 py-2 text-center font-semibold tabular-nums">
                {player.recommendedRound.toFixed(1)}
            </td>
            <td className="px-3 py-2 text-center">
                {isCaptain && onSetRound !== undefined ? (
                    <select
                        value={setRound ?? ""}
                        onChange={(e) => onSetRound(Number(e.target.value))}
                        className="rounded border bg-background px-2 py-1 text-sm"
                    >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
                            <option key={r} value={r}>
                                {r}
                            </option>
                        ))}
                    </select>
                ) : null}
            </td>
        </tr>
    )
}

export function PlayerRoundTable({
    data,
    captainIds,
    captainRoundOverrides,
    onSetRound,
    onCaptainNameClick,
    onOpenDetail
}: {
    data: PrepareForDraftData
    captainIds: Set<string>
    captainRoundOverrides: Record<string, number>
    onSetRound: (userId: string, v: number) => void
    onCaptainNameClick: (captainUserId: string) => void
    onOpenDetail: (userId: string) => void
}) {
    const tableWrapperRef = useRef<HTMLDivElement>(null)
    const theadRef = useRef<HTMLTableSectionElement>(null)

    useEffect(() => {
        const wrapper = tableWrapperRef.current
        const thead = theadRef.current
        if (!wrapper || !thead) return

        const update = () => {
            const top = wrapper.getBoundingClientRect().top
            const maxShift = wrapper.offsetHeight - thead.offsetHeight
            if (top < 0 && -top < maxShift) {
                thead.style.transform = `translateY(${-top}px)`
            } else {
                thead.style.transform = ""
            }
        }

        window.addEventListener("scroll", update, { passive: true })
        return () => window.removeEventListener("scroll", update)
    }, [])

    return data.teams.length === 0 ? (
        <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
            No captains have been assigned to this division yet.
        </div>
    ) : (
        <div
            ref={tableWrapperRef}
            className="overflow-x-auto rounded-md border"
        >
            <table className="min-w-full border-collapse text-sm">
                <thead ref={theadRef} className="relative z-20">
                    <tr className="bg-muted">
                        <th className="sticky left-0 z-30 whitespace-nowrap border-r bg-muted px-3 py-2 text-left font-medium">
                            Player
                        </th>
                        {data.teams.map((team) => (
                            <th
                                key={team.teamId}
                                className="whitespace-nowrap px-3 py-2 text-center font-medium"
                            >
                                {data.usesCoaches ? (
                                    <span className="inline-flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onCaptainNameClick(
                                                    team.captain1.userId
                                                )
                                            }
                                            className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                                            title={
                                                team.captain2
                                                    ? `${team.captain1.displayName} ${team.captain1.lastName} & ${team.captain2.displayName} ${team.captain2.lastName} — view homework`
                                                    : `${team.captain1.displayName} ${team.captain1.lastName} — view homework`
                                            }
                                        >
                                            {team.teamName}
                                        </button>
                                        <span
                                            className="cursor-default font-normal text-muted-foreground"
                                            title={[
                                                `${team.captain1.displayName} ${team.captain1.lastName}: ${team.captain1Completed ? "completed" : "not completed"}`,
                                                team.captain2
                                                    ? `${team.captain2.displayName} ${team.captain2.lastName}: ${team.captain2Completed ? "completed" : "not completed"}`
                                                    : null
                                            ]
                                                .filter(Boolean)
                                                .join("\n")}
                                        >
                                            ({team.coachesCompleted}/
                                            {team.coachesTotal})
                                        </span>
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onCaptainNameClick(
                                                team.captain1.userId
                                            )
                                        }
                                        className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                                        title={
                                            team.captain2
                                                ? `${team.captain1.displayName} ${team.captain1.lastName} & ${team.captain2.displayName} ${team.captain2.lastName} — view homework`
                                                : `${team.captain1.displayName} ${team.captain1.lastName} — view homework`
                                        }
                                    >
                                        {team.captain1.displayName}
                                    </button>
                                )}
                            </th>
                        ))}
                        <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                            Cap Avg
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                            Draft History
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                            Rec&apos;d Round
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                            Set Round
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {data.players.map((player) => {
                        const isCap = captainIds.has(player.userId)
                        const roundValue =
                            captainRoundOverrides[player.userId] ??
                            data.savedCaptainRounds[player.userId] ??
                            clampRound(player.recommendedRound)
                        return (
                            <PlayerTableRow
                                key={player.userId}
                                player={player}
                                isCaptain={isCap}
                                setRound={isCap ? roundValue : undefined}
                                onSetRound={
                                    isCap
                                        ? (v) => onSetRound(player.userId, v)
                                        : undefined
                                }
                                onOpenDetail={onOpenDetail}
                            />
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
