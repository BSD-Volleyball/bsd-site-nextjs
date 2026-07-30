// Parses archived "<Season> <Year> <Division> Division Rosters" pages.
//
// These pages are the most valuable thing in the archive for the pre-2012 era:
// they are the only surviving record of who played on which team, AND they
// carry an explicit "(Capt)" marker that resolves captain identity outright.
// Standings pages name teams only by captain surname, which is ambiguous when
// two players share a surname -- a real page has both "Blanchard, Jack (Capt)"
// and "Blanchard, Peggy" on the same team. The marker settles it.
//
// Markup is consistent across the archived era:
//     <td><b>Team #1</b>
//     <br>Blackburn, Shannon
//     <br>Toth, Rick <b>(Capt)</b></td>

import { identifyPage } from "./identify"
import type { ParsedRosterPage, RosterPlayer, RosterTeam } from "./types"

const TEAM_HEADER = /Team\s*#\s*(\d+)/gi

// Only "(Capt)" is meaningful. Other parentheticals are free-form commentary
// from the league's webmaster -- a real page contains "Wohlford, Kyra (Sucks)".
const CAPTAIN_MARKER = /\(\s*capt[a-z]*\.?\s*\)/i

function decode(text: string): string {
    return text
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim()
}

function parsePlayerName(raw: string): RosterPlayer | null {
    const isCaptain = CAPTAIN_MARKER.test(raw)

    // Strip every parenthetical before splitting the name.
    const cleaned = decode(raw.replace(/\([^)]*\)/g, ""))
        .replace(/[,\s]+$/, "")
        .trim()

    if (!cleaned || !/[A-Za-z]/.test(cleaned)) {
        return null
    }

    const comma = cleaned.indexOf(",")
    if (comma !== -1) {
        const lastName = cleaned.slice(0, comma).trim()
        const firstName = cleaned.slice(comma + 1).trim()
        if (!lastName || !firstName) {
            return null
        }
        return { lastName, firstName, isCaptain, raw: decode(raw) }
    }

    // A few entries were typed as "First Last" instead of "Last, First".
    const parts = cleaned.split(/\s+/)
    if (parts.length < 2) {
        return null
    }

    return {
        lastName: parts[parts.length - 1],
        firstName: parts.slice(0, -1).join(" "),
        isCaptain,
        raw: decode(raw)
    }
}

function parseTeamBlock(block: string): RosterPlayer[] {
    return block
        .split(/<br\s*\/?>/i)
        .slice(1) // drop the "Team #N" header itself
        .map(parsePlayerName)
        .filter((p): p is RosterPlayer => p !== null)
}

export function parseRosterTeams(html: string): RosterTeam[] {
    const teams: RosterTeam[] = []
    const headers = [...html.matchAll(TEAM_HEADER)]

    for (let i = 0; i < headers.length; i++) {
        const header = headers[i]
        const start = header.index ?? 0
        const nextHeaderStart = headers[i + 1]?.index ?? html.length

        // A team's players run to the end of its table cell, or to the next
        // "Team #" header if the cell was never closed.
        const cellEnd = html.toLowerCase().indexOf("</td>", start)
        const end =
            cellEnd !== -1 && cellEnd < nextHeaderStart
                ? cellEnd
                : nextHeaderStart

        const teamNumber = Number.parseInt(header[1], 10)
        if (Number.isNaN(teamNumber)) {
            continue
        }

        const players = parseTeamBlock(html.slice(start, end))
        if (players.length > 0) {
            teams.push({ teamNumber, players })
        }
    }

    return teams.sort((a, b) => a.teamNumber - b.teamNumber)
}

export function parseRosterPage(
    html: string,
    fileName: string
): ParsedRosterPage {
    return {
        identity: identifyPage(html, fileName),
        teams: parseRosterTeams(html)
    }
}
