// Shared shapes for parsing archived bumpsetdrink.com pages recovered from
// the Wayback Machine. These parsers are pure string -> object functions with
// no database access, so they can be unit tested against fixtures.

export type PageKind = "standings" | "playoff" | "roster"

// The old site was rebuilt around 2012; the two generations need different
// parsers. "old" is static HTML tables, "new" is a JS-driven page whose data
// lives in `var teamlist` / `var playdates` / `match.*` assignments.
export type PageEra = "old" | "new"

export interface SeasonRef {
    // "spring" | "summer" | "fall", matching seasons.season
    seasonName: string
    seasonYear: number
    // Division code as written on the page ("a", "bb", "bbb", ...), normalized
    // to lowercase alphanumerics. Null when the page did not say.
    divisionCode: string | null
}

export interface PageIdentity extends SeasonRef {
    // Where the season/division came from, so the inventory can rank its
    // confidence and flag anything that needed a weak source.
    source: "heading" | "title" | "filename" | "sibling" | "timestamp"
    // True when <title> and the in-body heading disagreed. Archived pages were
    // frequently copied forward without updating <title>, so a conflict means
    // the title is stale and must not be trusted.
    titleConflict: boolean
}

export interface RosterPlayer {
    lastName: string
    firstName: string
    isCaptain: boolean
    // The name exactly as printed, kept for audit trails and review queues.
    raw: string
}

export interface RosterTeam {
    teamNumber: number
    players: RosterPlayer[]
}

export interface ParsedRosterPage {
    identity: PageIdentity | null
    teams: RosterTeam[]
}

export interface SetScore {
    home: number
    away: number
}

/** A row of the archived standings table. Used to verify imported matches. */
export interface StandingRow {
    teamNumber: number
    captainSurname: string
    wins: number
    losses: number
    gamesBehind: number | null
}

/** One cell of the archived schedule grid: a date, a time slot, a pairing. */
export interface ScheduleSlot {
    dateIso: string
    time: string | null
    homeNumber: number
    awayNumber: number
    note: string | null
}

export interface ParsedMatch {
    week: number
    // Label as printed, e.g. "October 19" -- kept so failures are traceable.
    dateLabel: string
    dateIso: string | null
    time: string | null
    court: number | null
    // The archived results list the WINNER first, so "home" here means
    // first-listed, not home court. Set scores follow the same orientation.
    homeNumber: number | null
    awayNumber: number | null
    homeSurname: string
    awaySurname: string
    homeGames: number
    awayGames: number
    sets: SetScore[]
    note: string | null
}

/**
 * A playoff slot reference as printed on the bracket: "S4" (4th seed), "W1"
 * (winner of match 1), "L2" (loser of match 2). Matches the token grammar
 * already used by playoff_matches_meta.home_source / away_source.
 */
export interface PlayoffRef {
    kind: "seed" | "winner" | "loser"
    value: number
    token: string
}

export interface PlayoffMatch {
    matchNumber: number
    // "*" on the page means "if necessary" -- the match may never be played.
    ifNecessary: boolean
    dateIso: string | null
    time: string | null
    court: number | null
    // Once played, the page replaces the W#/L# token with the captain surname,
    // so each side is either a resolved surname or an unresolved reference.
    winnerSurname: string | null
    loserSurname: string | null
    winnerRef: PlayoffRef | null
    loserRef: PlayoffRef | null
    workSurname: string | null
    workRef: PlayoffRef | null
    sets: SetScore[]
}

/**
 * A row of the "Position | Team" table printed beside the bracket.
 *
 * This is the REGULAR-SEASON finishing order (the playoff seeding), NOT the
 * final playoff placement. Proven on the Fall 2000 A division page, where the
 * table lists Weaver 1st even though Weaver lost every playoff match and
 * Gillick -- the recorded champion -- won the final.
 *
 * That makes it the right source for teams.rank, which seed-playoffs.ts also
 * treats as the regular-season seed and next-match-actions.ts reads back to
 * resolve "S1".."S6" bracket sources.
 */
export interface SeedRow {
    position: number
    captainSurname: string
}

export interface ParsedPlayoffPage {
    identity: PageIdentity | null
    matches: PlayoffMatch[]
    seeding: SeedRow[]
}

export interface ParsedStandingsPage {
    identity: PageIdentity | null
    standings: StandingRow[]
    schedule: ScheduleSlot[]
    matches: ParsedMatch[]
}
