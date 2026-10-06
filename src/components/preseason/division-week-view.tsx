import type { ReactNode } from "react"
import { PageHeader } from "@/components/layout/page-header"
import { PlayerHighlightLegend } from "@/components/player-highlight-legend"
import { PrintButton } from "@/components/preseason/print-button"
import {
    buildDivisionWeekSchedule,
    type DivisionWeekGroup
} from "@/lib/preseason/division-week-rosters"
import {
    getPlayerHighlight,
    playerHighlightClass
} from "@/lib/player-highlight"
import type { SeasonConfig } from "@/lib/season-types"
import {
    formatEventDate,
    formatEventTime,
    formatSeasonLabel,
    getEventsByType
} from "@/lib/season-utils"
import { formatTryoutTeamLabel } from "@/lib/tryout-team-names"
import { cn } from "@/lib/utils"

interface DivisionWeekViewProps {
    week: 2 | 3
    config: SeasonConfig
    divisions: DivisionWeekGroup[]
    userId: string
    friendIds: string[]
    /** The "About the preseason rosters" explainer, which differs per week. */
    intro: ReactNode
}

const PRINT_STYLES = `
    @media print {
        @page { size: 8.5in 11in portrait; margin: 0.4in; }
        main, main * { border-radius: 0 !important; overflow: visible !important; }
        header { display: none !important; }
        .pwk-page { page-break-after: always; color: #000; }
        .pwk-page:last-child { page-break-after: auto; }
        .pwk-page * { color: #000 !important; }
        .pwk-header { text-align: center; margin-bottom: 8pt; }
        .pwk-title { font-size: 14pt; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
        .pwk-date { font-size: 10pt; margin-top: 2pt; }
        .pwk-division { font-size: 13pt; font-weight: 700; border-bottom: 2px solid #000; margin-bottom: 6pt; padding-bottom: 2pt; }
        .pwk-teams-3col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6pt; margin-bottom: 10pt; }
        .pwk-teams-2col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6pt; margin-bottom: 10pt; }
        .pwk-team { border: 1px solid #999; border-radius: 2pt; padding: 5pt; }
        .pwk-team-name { font-size: 10.5pt; font-weight: 600; margin-bottom: 3pt; border-bottom: 1px solid #ccc; padding-bottom: 2pt; }
        .pwk-player { font-size: 9.5pt; line-height: 1.5; padding: 1pt 0; list-style: none; }
        .pwk-schedule-title { font-size: 10pt; font-weight: 600; margin-bottom: 3pt; }
        .pwk-schedule { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
        .pwk-schedule th, .pwk-schedule td { border: 1px solid #999; padding: 3pt 6pt; text-align: left; }
        .pwk-schedule th { background: #eee; font-weight: 600; }
    }
`

/**
 * The player-facing Pre-Season Week 2/3 page: an on-screen view of every
 * division's tryout teams and matches, and a print view with one portrait
 * page per division.
 */
export function DivisionWeekView({
    week,
    config,
    divisions,
    userId,
    friendIds,
    intro
}: DivisionWeekViewProps) {
    const seasonLabel = formatSeasonLabel(config)
    const tryout = getEventsByType(config, "tryout")[week - 1]
    const dateDisplay = tryout ? formatEventDate(tryout.eventDate) : "Date TBD"
    const sessionTimes = [0, 1, 2].map((slot) =>
        tryout?.timeSlots[slot]
            ? formatEventTime(tryout.timeSlots[slot].startTime)
            : "Time TBD"
    )

    const sections = divisions.map((division, divisionIndex) => {
        const maxTeamNumber = Math.max(
            ...division.teams.map((team) => team.teamNumber)
        )
        return {
            division,
            maxTeamNumber,
            scheduleRows: buildDivisionWeekSchedule(
                division.divisionName,
                maxTeamNumber,
                divisionIndex,
                sessionTimes
            )
        }
    })

    return (
        <>
            {/* Screen view */}
            <div className="space-y-8 print:hidden">
                <div className="flex items-start justify-between">
                    <PageHeader
                        title={`${seasonLabel} Pre-Season Week ${week}`}
                        description={`Preseason week ${week} roster assignments grouped by division and team.`}
                    />
                    <PrintButton />
                </div>

                <div className="space-y-4 rounded-lg border bg-muted/20 p-5">
                    {intro}
                </div>

                <h2 className="font-semibold text-xl">
                    Preseason Week {week} - {dateDisplay}
                </h2>

                <PlayerHighlightLegend hasFriends={friendIds.length > 0} />

                {sections.length === 0 ? (
                    <div className="rounded-lg border bg-card p-4 text-muted-foreground text-sm">
                        No Week {week} roster assignments were found for the
                        current season.
                    </div>
                ) : (
                    sections.map(
                        ({ division, maxTeamNumber, scheduleRows }) => (
                            <section
                                key={division.divisionId}
                                className="space-y-4 rounded-lg border bg-card p-5"
                            >
                                <h2 className="font-semibold text-xl">
                                    {division.divisionName} Division
                                </h2>

                                <div
                                    className={
                                        maxTeamNumber <= 4
                                            ? "grid gap-4 md:grid-cols-2"
                                            : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                                    }
                                >
                                    {division.teams.map((team) => (
                                        <div
                                            key={`${division.divisionId}-${team.teamNumber}`}
                                            className="rounded-lg border bg-muted/20 p-4"
                                        >
                                            <h3 className="mb-3 font-semibold text-base">
                                                Team{" "}
                                                {formatTryoutTeamLabel(
                                                    division.divisionName,
                                                    team.teamNumber
                                                )}
                                            </h3>
                                            <ol className="space-y-1.5 text-sm">
                                                {team.players.map((player) => (
                                                    <li
                                                        key={`${player.userId}-${division.divisionId}-${team.teamNumber}`}
                                                        className={cn(
                                                            "rounded-sm px-2 py-1",
                                                            playerHighlightClass(
                                                                getPlayerHighlight(
                                                                    player.userId,
                                                                    userId,
                                                                    friendIds
                                                                ),
                                                                "bg-background"
                                                            )
                                                        )}
                                                    >
                                                        {player.displayName}
                                                        {player.hasAsterisk && (
                                                            <>
                                                                {" "}
                                                                <strong>
                                                                    *
                                                                </strong>
                                                            </>
                                                        )}
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    ))}
                                </div>

                                {scheduleRows.length > 0 && (
                                    <div className="overflow-x-auto rounded-lg border">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/40">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">
                                                        Time
                                                    </th>
                                                    <th className="px-3 py-2 text-left">
                                                        Court
                                                    </th>
                                                    <th className="px-3 py-2 text-left">
                                                        Match
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {scheduleRows.map((row) => (
                                                    <tr
                                                        key={`${division.divisionId}-${row.matchLabel}`}
                                                        className="border-t"
                                                    >
                                                        <td className="px-3 py-2">
                                                            {row.time}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {row.courtNumber}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {row.matchLabel}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        )
                    )
                )}
            </div>

            {/* Print-only view — one page per division, portrait 8.5×11 */}
            <div className="hidden print:block">
                <style>{PRINT_STYLES}</style>
                {sections.map(({ division, maxTeamNumber, scheduleRows }) => (
                    <div
                        key={`print-${division.divisionId}`}
                        className="pwk-page"
                    >
                        <div className="pwk-header">
                            <div className="pwk-title">
                                {seasonLabel} Pre-Season Week {week}
                            </div>
                            <div className="pwk-date">{dateDisplay}</div>
                        </div>

                        <div className="pwk-division">
                            {division.divisionName} Division
                        </div>

                        <div
                            className={
                                maxTeamNumber >= 5
                                    ? "pwk-teams-3col"
                                    : "pwk-teams-2col"
                            }
                        >
                            {division.teams.map((team) => (
                                <div
                                    key={`print-${division.divisionId}-${team.teamNumber}`}
                                    className="pwk-team"
                                >
                                    <div className="pwk-team-name">
                                        Team{" "}
                                        {formatTryoutTeamLabel(
                                            division.divisionName,
                                            team.teamNumber
                                        )}
                                    </div>
                                    <ol style={{ margin: 0, padding: 0 }}>
                                        {team.players.map((player) => (
                                            <li
                                                key={`print-${player.userId}-${division.divisionId}-${team.teamNumber}`}
                                                className="pwk-player"
                                            >
                                                {player.displayName}
                                                {player.hasAsterisk && " *"}
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            ))}
                        </div>

                        {scheduleRows.length > 0 && (
                            <div>
                                <div className="pwk-schedule-title">
                                    Schedule
                                </div>
                                <table className="pwk-schedule">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Court</th>
                                            <th>Match</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {scheduleRows.map((row) => (
                                            <tr
                                                key={`print-${division.divisionId}-${row.matchLabel}`}
                                            >
                                                <td>{row.time}</td>
                                                <td>{row.courtNumber}</td>
                                                <td>{row.matchLabel}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </>
    )
}
