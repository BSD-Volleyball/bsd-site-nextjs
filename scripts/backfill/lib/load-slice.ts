// Turns one inventory record into normalized data, by dispatching to whichever
// parser that page's markup family needs.
//
// The eras do not line up across page kinds (see PageEra), so dispatch is on
// (kind, era) rather than on either alone.

import fs from "node:fs"
import { parseJsStandingsPage } from "../../../src/lib/wayback/parse-js-era"
import { parseJsPlayoffPage } from "../../../src/lib/wayback/parse-js-playoff"
import { parseOldEraStandingsPage } from "../../../src/lib/wayback/parse-old-era"
import { parsePlayoffPage } from "../../../src/lib/wayback/parse-playoff-table"
import { parseRosterPage } from "../../../src/lib/wayback/parse-rosters"
import { parseStackedStandingsPage } from "../../../src/lib/wayback/parse-stacked-era"
import type {
    ParsedMatch,
    PlayoffRef,
    RosterTeam,
    SetScore,
    StandingRow
} from "../../../src/lib/wayback/types"

export interface InventoryRecord {
    key: string
    source: "local" | "wayback"
    seasonCode: string
    divisionCode: string
    kind: "standings" | "playoff" | "roster"
    era: string
    filePath: string
    snapshotTs: string | null
    scoreCount: number
    seasonSource: string
    titleConflict: boolean
}

/** A playoff match in a shape both playoff eras can produce. */
export interface NormalizedPlayoffMatch {
    matchNumber: number
    week: number
    dateIso: string | null
    time: string | null
    court: number | null
    // JS-era pages give slot references; the older table pages give the
    // participants' surnames once the match has been played. Either can be
    // absent, and playoff_matches_meta needs BOTH refs, so a match with only
    // names yields a matches row without a meta row.
    homeRef: PlayoffRef | null
    awayRef: PlayoffRef | null
    workRef: PlayoffRef | null
    winnerSurname: string | null
    loserSurname: string | null
    sets: SetScore[]
    homeGames: number
    awayGames: number
}

export interface LoadedSlice {
    record: InventoryRecord
    seasonName: string
    seasonYear: number
    standings: StandingRow[]
    matches: ParsedMatch[]
    rosterTeams: RosterTeam[]
    playoffMatches: NormalizedPlayoffMatch[]
    /** Seed position (1-based) -> team number. Feeds teams.rank. */
    seeding: Map<number, number>
    /** Team number -> captain surname, when the page states it. */
    teamCaptains: Map<number, string>
    warnings: string[]
}

const SEASON_NAME: Record<string, string> = {
    S: "spring",
    U: "summer",
    F: "fall",
    W: "winter"
}

export function seasonOf(seasonCode: string): {
    seasonName: string
    seasonYear: number
} {
    const twoDigit = Number.parseInt(seasonCode.slice(1), 10)
    return {
        seasonName: SEASON_NAME[seasonCode[0]] ?? "fall",
        // The league started in 1995, so a high two-digit year is 19xx.
        seasonYear: twoDigit > 90 ? 1900 + twoDigit : 2000 + twoDigit
    }
}

function empty(
    record: InventoryRecord,
    season: ReturnType<typeof seasonOf>
): LoadedSlice {
    return {
        record,
        ...season,
        standings: [],
        matches: [],
        rosterTeams: [],
        playoffMatches: [],
        seeding: new Map(),
        teamCaptains: new Map(),
        warnings: []
    }
}

export function loadSlice(record: InventoryRecord): LoadedSlice {
    const season = seasonOf(record.seasonCode)
    const html = fs.readFileSync(record.filePath, "utf-8")
    const fileName = record.filePath.split("/").pop() ?? ""
    const slice = empty(record, season)

    if (record.kind === "roster") {
        const page = parseRosterPage(html, fileName)
        slice.rosterTeams = page.teams
        for (const team of page.teams) {
            const captain = team.players.find((p) => p.isCaptain)
            // Register the team either way. A missing (Capt) marker means we
            // cannot name the team after its captain, but the team still
            // existed and its players still need somewhere to go.
            slice.teamCaptains.set(team.teamNumber, captain?.lastName ?? "")
            if (!captain) {
                slice.warnings.push(
                    `team ${team.teamNumber} has no (Capt) marker`
                )
            }
        }
        return slice
    }

    if (record.kind === "standings") {
        if (record.era.startsWith("js")) {
            const page = parseJsStandingsPage(html, fileName, season)
            slice.matches = page.matches
            slice.teamCaptains = page.teams
        } else if (record.era === "stacked") {
            const page = parseStackedStandingsPage(html, fileName, season)
            slice.standings = page.standings
            slice.matches = page.matches
            for (const row of page.standings) {
                slice.teamCaptains.set(row.teamNumber, row.captainSurname)
            }
        } else {
            const page = parseOldEraStandingsPage(html, fileName)
            slice.standings = page.standings
            slice.matches = page.matches
            for (const row of page.standings) {
                slice.teamCaptains.set(row.teamNumber, row.captainSurname)
            }
        }

        // The published standings order IS the regular-season seeding, which
        // is what teams.rank means.
        slice.standings.forEach((row, index) => {
            slice.seeding.set(index + 1, row.teamNumber)
        })
        return slice
    }

    // playoff
    if (record.era.startsWith("js")) {
        const page = parseJsPlayoffPage(html, fileName, season)
        slice.seeding = page.seeding
        slice.teamCaptains = page.teams
        slice.playoffMatches = page.matches.map((m) => ({
            matchNumber: m.matchNumber,
            week: m.week,
            dateIso: m.dateIso,
            time: m.time,
            court: m.court,
            homeRef: m.homeRef,
            awayRef: m.awayRef,
            workRef: m.workRef,
            winnerSurname: null,
            loserSurname: null,
            sets: m.sets,
            homeGames: m.homeGames,
            awayGames: m.awayGames
        }))
        return slice
    }

    const page = parsePlayoffPage(html, fileName, season.seasonYear)
    // The "Position | Team" table beside the bracket is the regular-season
    // seeding, not the finishing order.
    page.seeding.forEach((row) => {
        slice.seeding.set(row.position, Number.NaN)
        slice.teamCaptains.set(row.position, row.captainSurname)
    })
    slice.playoffMatches = page.matches.map((m) => ({
        matchNumber: m.matchNumber,
        // Table-era pages have no week field; matches are grouped by date, and
        // the importer assigns weeks from the distinct dates in order.
        week: 0,
        dateIso: m.dateIso,
        time: m.time,
        court: m.court,
        homeRef: m.winnerRef,
        awayRef: m.loserRef,
        workRef: m.workRef,
        winnerSurname: m.winnerSurname,
        loserSurname: m.loserSurname,
        sets: m.sets,
        homeGames: m.sets.filter((s) => s.home > s.away).length,
        awayGames: m.sets.filter((s) => s.away > s.home).length
    }))

    // Assign playoff weeks from the distinct play dates, in order.
    const dates = [
        ...new Set(slice.playoffMatches.map((m) => m.dateIso).filter(Boolean))
    ].sort() as string[]
    for (const match of slice.playoffMatches) {
        const at = match.dateIso ? dates.indexOf(match.dateIso) : -1
        match.week = at === -1 ? 1 : at + 1
    }

    return slice
}

export function loadInventory(file: string): InventoryRecord[] {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as InventoryRecord[]
}
