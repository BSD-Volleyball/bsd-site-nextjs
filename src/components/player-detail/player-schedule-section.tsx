"use client"

import { useEffect, useState } from "react"
import { getPlayerSchedule } from "@/app/dashboard/player-lookup/actions"
import type {
    PlayerScheduleData,
    PlayerScheduleEntry
} from "@/lib/player-schedule-types"
import { formatEventDate } from "@/lib/season-utils"

interface PlayerScheduleSectionProps {
    open: boolean
    playerId: string | null | undefined
}

/**
 * Upcoming schedule (tryouts / games / reffing / volunteering) for the player
 * shown in a detail pop-up. Self-fetches keyed on the player id — same
 * contract as the roles section in the admin pop-up — and renders nothing
 * while loading, on auth failure, or when the player has nothing upcoming.
 */
export function PlayerScheduleSection({
    open,
    playerId
}: PlayerScheduleSectionProps) {
    const [schedule, setSchedule] = useState<PlayerScheduleData | null>(null)

    useEffect(() => {
        if (!open || !playerId) {
            setSchedule(null)
            return
        }
        let cancelled = false
        setSchedule(null)
        ;(async () => {
            const result = await getPlayerSchedule(playerId)
            if (!cancelled) setSchedule(result)
        })()
        return () => {
            cancelled = true
        }
    }, [open, playerId])

    if (!schedule) return null

    const groups: Array<[string, PlayerScheduleEntry[]]> = [
        ["Tryouts", schedule.tryouts],
        ["Games", schedule.games],
        ["Reffing", schedule.reffing],
        ["Volunteering", schedule.volunteering]
    ]
    const nonEmpty = groups.filter(([, entries]) => entries.length > 0)
    if (nonEmpty.length === 0) return null

    return (
        <div>
            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                Schedule
            </h3>
            <div className="space-y-3">
                {nonEmpty.map(([title, entries]) => (
                    <div key={title}>
                        <div className="mb-1 font-medium text-sm">{title}</div>
                        <ul className="space-y-1 text-sm">
                            {entries.map((entry, index) => (
                                <li
                                    key={`${entry.date}-${entry.label}-${index}`}
                                >
                                    <span className="font-medium">
                                        {formatEventDate(entry.date)}
                                    </span>
                                    {entry.timeLabel && (
                                        <span className="ml-2">
                                            {entry.timeLabel}
                                        </span>
                                    )}
                                    {entry.court !== null && (
                                        <span className="ml-2 text-muted-foreground">
                                            Court {entry.court}
                                        </span>
                                    )}
                                    <span className="ml-2">{entry.label}</span>
                                    {entry.sublabel && (
                                        <span className="ml-2 text-muted-foreground">
                                            {entry.sublabel}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    )
}
