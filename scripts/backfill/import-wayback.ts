#!/usr/bin/env tsx
// Writes the parsed archive into the database.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill/import-wayback.ts --dry-run
//   ... --seasons F16,S17 --kinds rosters,matches,playoffs
//
// Ordering matters: rosters are imported first, because for pre-2012 seasons
// they are what CREATES the teams (those seasons only have a champion stub in
// the teams table, with number NULL). Matches then resolve against them.
//
// Safety: a season that already has matches or drafts is refused unless
// --replace-existing is passed together with an explicit --seasons list, so a
// default run cannot touch live data.

import "dotenv/config"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../../src/database/db"
import {
    divisions,
    drafts,
    matches,
    playoffMatchesMeta,
    seasons,
    teams,
    users
} from "../../src/database/schema"
import { GHOST_CAPTAIN_ID } from "../../src/lib/ghost-captain"
import { type LoadedSlice, loadInventory, loadSlice } from "./lib/load-slice"

const INVENTORY = path.join(process.cwd(), "scripts", "data", "inventory.json")
const REPORT_DIR = path.join(process.cwd(), "scripts", "data")

// Historical rosters are alphabetical and carry no draft order, so every
// player in a division gets the SAME position: the first pick of round 4.
// Uniform values assert no false ordering while placing them mid-draft.
const HISTORICAL_ROUND = 4

interface Options {
    seasons: string[] | null
    divisions: string[] | null
    kinds: Set<string>
    dryRun: boolean
    replaceExisting: boolean
    limit: number | null
}

function parseArgs(): Options {
    const argv = process.argv.slice(2)
    const options: Options = {
        seasons: null,
        divisions: null,
        kinds: new Set(["rosters", "matches", "playoffs"]),
        dryRun: false,
        replaceExisting: false,
        limit: null
    }

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === "--dry-run") {
            options.dryRun = true
        } else if (arg === "--replace-existing") {
            options.replaceExisting = true
        } else if (arg === "--seasons") {
            options.seasons = (argv[++i] ?? "").split(",").filter(Boolean)
        } else if (arg === "--divisions") {
            options.divisions = (argv[++i] ?? "")
                .split(",")
                .filter(Boolean)
                .map((d) => d.toLowerCase())
        } else if (arg === "--kinds") {
            options.kinds = new Set(
                (argv[++i] ?? "").split(",").filter(Boolean)
            )
        } else if (arg === "--limit") {
            options.limit = Number.parseInt(argv[++i] ?? "", 10) || null
        } else if (arg === "--help") {
            console.log(
                [
                    "Usage: npx tsx scripts/backfill/import-wayback.ts [options]",
                    "",
                    "  --seasons S16,F16     Restrict to these season codes",
                    "  --divisions a,bb      Restrict to these divisions",
                    "  --kinds rosters,...   rosters | matches | playoffs",
                    "  --dry-run             Report only, write nothing",
                    "  --replace-existing    Allow overwriting a season that has data",
                    "  --limit N             Stop after N slices"
                ].join("\n")
            )
            process.exit(0)
        } else {
            console.error(`Unknown argument: ${arg}`)
            process.exit(1)
        }
    }

    return options
}

const normalizeName = (value: string) =>
    value.toLowerCase().replace(/[^a-z]/g, "")

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
}

interface PlayerBinding {
    seasonCode: string
    divisionCode: string
    teamNumber: number
    raw: string
    firstName: string
    lastName: string
    userId: string
    action: "matched" | "created" | "review"
    candidates?: string[]
}

async function main() {
    const options = parseArgs()

    if (!fs.existsSync(INVENTORY)) {
        console.error(
            "No inventory.json -- run scripts/backfill/inventory.ts first"
        )
        process.exit(1)
    }

    let records = loadInventory(INVENTORY)
    if (options.seasons) {
        const wanted = new Set(options.seasons)
        records = records.filter((r) => wanted.has(r.seasonCode))
    }
    if (options.divisions) {
        const wanted = new Set(options.divisions)
        records = records.filter((r) => wanted.has(r.divisionCode))
    }

    // Rosters first: for pre-2012 seasons they create the teams that the match
    // import then resolves against.
    const kindOrder: Record<string, number> = {
        roster: 0,
        standings: 1,
        playoff: 2
    }
    records.sort(
        (a, b) =>
            a.seasonCode.localeCompare(b.seasonCode) ||
            kindOrder[a.kind] - kindOrder[b.kind] ||
            a.divisionCode.localeCompare(b.divisionCode)
    )

    const seasonRows = await db
        .select({ id: seasons.id, code: seasons.code })
        .from(seasons)
    const seasonIdByCode = new Map(seasonRows.map((r) => [r.code, r.id]))

    const divisionRows = await db
        .select({ id: divisions.id, name: divisions.name })
        .from(divisions)
    const divisionIdByCode = new Map(
        divisionRows.map((r) => [r.name.toLowerCase(), r.id])
    )

    // Guardrail: never touch a season that already holds data unless the
    // caller named it explicitly AND asked for replacement.
    const targetSeasonIds = [
        ...new Set(records.map((r) => seasonIdByCode.get(r.seasonCode)))
    ].filter((id): id is number => id !== undefined)

    if (targetSeasonIds.length > 0) {
        const existing = await db
            .select({ season: matches.season })
            .from(matches)
            .where(inArray(matches.season, targetSeasonIds))
        const occupied = new Set(existing.map((r) => r.season))
        if (
            occupied.size > 0 &&
            !(options.replaceExisting && options.seasons)
        ) {
            const codes = [...occupied]
                .map((id) => seasonRows.find((s) => s.id === id)?.code)
                .join(", ")
            console.error(
                `Refusing to run: ${codes} already have matches.\n` +
                    "Pass --replace-existing together with an explicit --seasons list."
            )
            process.exit(1)
        }
    }

    // Seasons that already have rosters must not get a second set. 2012+ were
    // imported years ago; only the pre-2012 seasons need creating.
    const existingDrafts = await db
        .select({ season: teams.season })
        .from(drafts)
        .innerJoin(teams, eq(teams.id, drafts.team))
    const seasonsWithRosters = new Set(existingDrafts.map((r) => r.season))

    const playerBindings: PlayerBinding[] = []
    const reviewQueue: PlayerBinding[] = []
    const problems: string[] = []
    const summary = {
        slices: 0,
        teamsCreated: 0,
        usersCreated: 0,
        drafts: 0,
        regularMatches: 0,
        playoffMatches: 0,
        metaRows: 0,
        ranks: 0
    }

    // Cache of existing users for name matching, loaded once.
    const userRows = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name
        })
        .from(users)
    const usersByFullName = new Map<string, string[]>()
    const usersByLastName = new Map<string, string[]>()
    for (const row of userRows) {
        const full = `${normalizeName(row.firstName)}|${normalizeName(row.lastName)}`
        usersByFullName.set(full, [
            ...(usersByFullName.get(full) ?? []),
            row.id
        ])
        const last = normalizeName(row.lastName)
        usersByLastName.set(last, [
            ...(usersByLastName.get(last) ?? []),
            row.id
        ])
    }

    let processed = 0
    for (const record of records) {
        if (options.limit && processed >= options.limit) {
            break
        }
        const kindKey =
            record.kind === "roster"
                ? "rosters"
                : record.kind === "standings"
                  ? "matches"
                  : "playoffs"
        if (!options.kinds.has(kindKey)) {
            continue
        }

        const seasonId = seasonIdByCode.get(record.seasonCode)
        const divisionId = divisionIdByCode.get(record.divisionCode)
        if (seasonId === undefined) {
            problems.push(
                `${record.key}: no seasons row for ${record.seasonCode}`
            )
            continue
        }
        if (divisionId === undefined) {
            problems.push(
                `${record.key}: no divisions row for ${record.divisionCode}`
            )
            continue
        }

        let slice: LoadedSlice
        try {
            slice = loadSlice(record)
        } catch (error) {
            problems.push(
                `${record.key}: parse failed -- ${(error as Error).message}`
            )
            continue
        }

        processed++
        summary.slices++

        await importSlice({
            slice,
            seasonId,
            divisionId,
            options,
            summary,
            problems,
            playerBindings,
            reviewQueue,
            usersByFullName,
            usersByLastName,
            seasonsWithRosters
        })
    }

    console.log("\n=== SUMMARY ===")
    for (const [key, value] of Object.entries(summary)) {
        console.log(`  ${key.padEnd(16)} ${value}`)
    }

    if (problems.length > 0) {
        console.log(`\n=== PROBLEMS (${problems.length}) ===`)
        for (const problem of problems.slice(0, 40)) {
            console.log(`  ${problem}`)
        }
        if (problems.length > 40) {
            console.log(`  ... and ${problems.length - 40} more`)
        }
    }

    if (!options.dryRun) {
        fs.writeFileSync(
            path.join(REPORT_DIR, "player-bindings.json"),
            `${JSON.stringify(playerBindings, null, 1)}\n`
        )
        fs.writeFileSync(
            path.join(REPORT_DIR, "player-review-queue.json"),
            `${JSON.stringify(reviewQueue, null, 1)}\n`
        )
        console.log(
            `\nwrote player-bindings.json (${playerBindings.length}) and ` +
                `player-review-queue.json (${reviewQueue.length})`
        )
    } else {
        console.log(
            `\nDRY RUN -- nothing written. ` +
                `${playerBindings.length} player bindings, ${reviewQueue.length} need review.`
        )
    }
}

interface ImportContext {
    slice: LoadedSlice
    seasonId: number
    divisionId: number
    options: Options
    summary: Record<string, number>
    problems: string[]
    playerBindings: PlayerBinding[]
    reviewQueue: PlayerBinding[]
    usersByFullName: Map<string, string[]>
    usersByLastName: Map<string, string[]>
    seasonsWithRosters: Set<number>
}

/** Existing teams for this season+division, keyed by their team number. */
async function loadTeamMap(seasonId: number, divisionId: number) {
    const rows = await db
        .select({ id: teams.id, number: teams.number, name: teams.name })
        .from(teams)
        .where(and(eq(teams.season, seasonId), eq(teams.division, divisionId)))
    const byNumber = new Map<number, number>()
    for (const row of rows) {
        if (row.number !== null) {
            byNumber.set(row.number, row.id)
        }
    }
    return { rows, byNumber }
}

async function importSlice(context: ImportContext) {
    const { slice, seasonId, divisionId, options } = context

    if (slice.record.kind === "roster") {
        await importRoster(context)
        return
    }
    if (slice.record.kind === "standings") {
        await importMatches(context)
        return
    }
    await importPlayoffs(context)

    void seasonId
    void divisionId
    void options
}

async function resolveOrCreateTeams(context: ImportContext) {
    const { slice, seasonId, divisionId, options, summary, problems } = context
    const { rows, byNumber } = await loadTeamMap(seasonId, divisionId)

    const wanted = [...slice.teamCaptains.keys()].sort((a, b) => a - b)
    const resolved = new Map(byNumber)

    for (const teamNumber of wanted) {
        if (resolved.has(teamNumber)) {
            continue
        }
        const captainSurname = slice.teamCaptains.get(teamNumber) ?? ""

        // Pre-2012 seasons only carry a champion stub, with number NULL. If its
        // captain matches, adopt that row and fill in the number rather than
        // creating a duplicate team.
        const stub = rows.find(
            (row) =>
                row.number === null &&
                normalizeName(row.name).includes(
                    normalizeName(captainSurname)
                ) &&
                normalizeName(captainSurname).length > 0
        )

        if (stub) {
            if (!options.dryRun) {
                await db
                    .update(teams)
                    .set({ number: teamNumber })
                    .where(eq(teams.id, stub.id))
            }
            stub.number = teamNumber
            resolved.set(teamNumber, stub.id)
            continue
        }

        if (options.dryRun) {
            // Use a negative sentinel so downstream counting still works.
            resolved.set(teamNumber, -teamNumber)
            summary.teamsCreated++
            continue
        }

        const inserted = await db
            .insert(teams)
            .values({
                season: seasonId,
                division: divisionId,
                captain: GHOST_CAPTAIN_ID,
                name: captainSurname
                    ? `Team ${captainSurname}`
                    : `Team ${teamNumber}`,
                number: teamNumber
            })
            .returning({ id: teams.id })

        if (inserted.length === 0) {
            problems.push(
                `${slice.record.key}: failed to create team ${teamNumber}`
            )
            continue
        }
        resolved.set(teamNumber, inserted[0].id)
        summary.teamsCreated++
    }

    return resolved
}

async function importRoster(context: ImportContext) {
    const {
        slice,
        seasonId,
        options,
        summary,
        problems,
        playerBindings,
        reviewQueue,
        usersByFullName,
        usersByLastName
    } = context

    if (context.seasonsWithRosters.has(seasonId) && !options.replaceExisting) {
        // Already imported (every season from S12 on). Re-importing would
        // duplicate every drafts row and every player's career history.
        return
    }

    const teamIds = await resolveOrCreateTeams(context)
    const teamCount = slice.rosterTeams.length
    // First pick of round 4, computed from the division's own team count.
    const overall = (HISTORICAL_ROUND - 1) * teamCount + 1

    for (const team of slice.rosterTeams) {
        const teamId = teamIds.get(team.teamNumber)
        if (teamId === undefined || teamId < 0) {
            if (teamId === undefined) {
                problems.push(
                    `${slice.record.key}: no team for roster team ${team.teamNumber}`
                )
            }
            if (options.dryRun) {
                summary.drafts += team.players.length
            }
            continue
        }

        for (const player of team.players) {
            const full = `${normalizeName(player.firstName)}|${normalizeName(player.lastName)}`
            const exact = usersByFullName.get(full) ?? []

            let userId: string
            let action: PlayerBinding["action"]
            let candidates: string[] | undefined

            if (exact.length === 1) {
                userId = exact[0]
                action = "matched"
            } else {
                // Same surname but a different or ambiguous first name is a
                // near match: record it for review rather than guessing, and
                // give the player their own legacy account meanwhile.
                const near =
                    usersByLastName.get(normalizeName(player.lastName)) ?? []
                action =
                    exact.length > 1 || near.length > 0 ? "review" : "created"
                candidates = action === "review" ? near.slice(0, 5) : undefined

                if (options.dryRun) {
                    userId = `dry-${full}`
                } else {
                    userId = randomUUID()
                    const email = `legacy-roster-${slugify(
                        `${player.firstName}-${player.lastName}-${slice.record.seasonCode}-${team.teamNumber}`
                    )}@bumpsetdrink.com`
                    await db.insert(users).values({
                        id: userId,
                        first_name: player.firstName,
                        last_name: player.lastName,
                        email
                    })
                    summary.usersCreated++
                    usersByFullName.set(full, [...exact, userId])
                }
            }

            const binding: PlayerBinding = {
                seasonCode: slice.record.seasonCode,
                divisionCode: slice.record.divisionCode,
                teamNumber: team.teamNumber,
                raw: player.raw,
                firstName: player.firstName,
                lastName: player.lastName,
                userId,
                action,
                candidates
            }
            playerBindings.push(binding)
            if (action === "review") {
                reviewQueue.push(binding)
            }

            if (!options.dryRun) {
                await db.insert(drafts).values({
                    team: teamId,
                    user: userId,
                    round: HISTORICAL_ROUND,
                    overall
                })
            }
            summary.drafts++
        }
    }

    void seasonId
}

function winnerOf(
    homeGames: number,
    awayGames: number,
    homeTeam: number | null,
    awayTeam: number | null
) {
    if (homeGames === awayGames) {
        return null
    }
    return homeGames > awayGames ? homeTeam : awayTeam
}

async function importMatches(context: ImportContext) {
    const { slice, seasonId, divisionId, options, summary, problems } = context
    const teamIds = await resolveOrCreateTeams(context)

    // Only the regular season comes from a standings page; playoff rows found
    // there are duplicated on play*.html, which is authoritative.
    const regular = slice.matches.filter((m) => !m.isPlayoff)

    if (!options.dryRun) {
        await db
            .delete(matches)
            .where(
                and(
                    eq(matches.season, seasonId),
                    eq(matches.division, divisionId),
                    eq(matches.playoff, false)
                )
            )
    }

    for (const match of regular) {
        const homeTeam =
            match.homeNumber !== null
                ? (teamIds.get(match.homeNumber) ?? null)
                : null
        const awayTeam =
            match.awayNumber !== null
                ? (teamIds.get(match.awayNumber) ?? null)
                : null

        if (homeTeam === null || awayTeam === null) {
            problems.push(
                `${slice.record.key}: week ${match.week} unresolved team ` +
                    `(${match.homeSurname} vs ${match.awaySurname})`
            )
            continue
        }

        summary.regularMatches++
        if (options.dryRun || homeTeam < 0 || awayTeam < 0) {
            continue
        }

        await db.insert(matches).values({
            season: seasonId,
            division: divisionId,
            week: match.week,
            date: match.dateIso,
            time: match.time,
            court: match.court,
            home_team: homeTeam,
            away_team: awayTeam,
            home_score: match.homeGames,
            away_score: match.awayGames,
            home_set1_score: match.sets[0]?.home ?? null,
            away_set1_score: match.sets[0]?.away ?? null,
            home_set2_score: match.sets[1]?.home ?? null,
            away_set2_score: match.sets[1]?.away ?? null,
            home_set3_score: match.sets[2]?.home ?? null,
            away_set3_score: match.sets[2]?.away ?? null,
            winner: winnerOf(
                match.homeGames,
                match.awayGames,
                homeTeam,
                awayTeam
            ),
            playoff: false
        })
    }

    // The published standings order is the regular-season seeding, which is
    // exactly what teams.rank means and what resolves S# playoff sources.
    if (!options.dryRun) {
        for (const [position, teamNumber] of slice.seeding) {
            const teamId = teamIds.get(teamNumber)
            if (teamId === undefined || teamId < 0) {
                continue
            }
            await db
                .update(teams)
                .set({ rank: position })
                .where(eq(teams.id, teamId))
            summary.ranks++
        }
    } else {
        summary.ranks += slice.seeding.size
    }
}

async function importPlayoffs(context: ImportContext) {
    const { slice, seasonId, divisionId, options, summary, problems } = context
    const { byNumber } = await loadTeamMap(seasonId, divisionId)

    if (byNumber.size === 0) {
        if (!options.dryRun) {
            problems.push(
                `${slice.record.key}: no numbered teams yet -- import rosters/matches first`
            )
            return
        }
        // In a dry run the teams were never actually created, so count what
        // WOULD be written rather than reporting a phantom problem.
        summary.playoffMatches += slice.playoffMatches.length
        summary.metaRows += slice.playoffMatches.filter(
            (m) => m.homeRef && m.awayRef
        ).length
        summary.ranks += slice.seeding.size
        return
    }

    // Playoff weeks must not collide with regular-season weeks. `playoff` is
    // the real disambiguator, but keeping the numbering contiguous matches how
    // the app already stores S26.
    const regularWeeks = await db
        .select({ week: matches.week })
        .from(matches)
        .where(
            and(
                eq(matches.season, seasonId),
                eq(matches.division, divisionId),
                eq(matches.playoff, false)
            )
        )
    const base = regularWeeks.reduce((max, row) => Math.max(max, row.week), 0)

    if (!options.dryRun) {
        // meta before matches: playoff_matches_meta references matches.id.
        await db
            .delete(playoffMatchesMeta)
            .where(
                and(
                    eq(playoffMatchesMeta.season, seasonId),
                    eq(playoffMatchesMeta.division, divisionId)
                )
            )
        await db
            .delete(matches)
            .where(
                and(
                    eq(matches.season, seasonId),
                    eq(matches.division, divisionId),
                    eq(matches.playoff, true)
                )
            )
    }

    const seedToTeamId = new Map<number, number>()
    for (const [position, teamNumber] of slice.seeding) {
        const teamId = byNumber.get(teamNumber)
        if (teamId !== undefined) {
            seedToTeamId.set(position, teamId)
        }
    }

    // The JS-era standings pages carry no published W/L table, so the seeding
    // only appears here, in the playoff page's `var seeds`. teams.rank is what
    // resolves the S# sources below, so it has to be written before use.
    for (const [position, teamId] of seedToTeamId) {
        summary.ranks++
        if (!options.dryRun) {
            await db
                .update(teams)
                .set({ rank: position })
                .where(eq(teams.id, teamId))
        }
    }

    // Resolve forward: a seed reference is known immediately, and W#/L#
    // references become known once the referenced match has been written.
    const winnerOfMatch = new Map<number, number>()
    const loserOfMatch = new Map<number, number>()

    const resolveRef = (
        ref: (typeof slice.playoffMatches)[number]["homeRef"]
    ) => {
        if (!ref) {
            return null
        }
        if (ref.kind === "seed") {
            return seedToTeamId.get(ref.value) ?? null
        }
        return (
            (ref.kind === "winner" ? winnerOfMatch : loserOfMatch).get(
                ref.value
            ) ?? null
        )
    }

    for (const match of [...slice.playoffMatches].sort(
        (a, b) => a.matchNumber - b.matchNumber
    )) {
        const homeTeam = match.winnerSurname ? null : resolveRef(match.homeRef)
        const awayTeam = match.loserSurname ? null : resolveRef(match.awayRef)

        const week = base + match.week
        summary.playoffMatches++
        if (match.homeRef && match.awayRef) {
            summary.metaRows++
        }

        if (options.dryRun) {
            continue
        }

        const inserted = await db
            .insert(matches)
            .values({
                season: seasonId,
                division: divisionId,
                week,
                date: match.dateIso,
                time: match.time,
                court: match.court,
                home_team: homeTeam,
                away_team: awayTeam,
                home_score: match.homeGames,
                away_score: match.awayGames,
                home_set1_score: match.sets[0]?.home ?? null,
                away_set1_score: match.sets[0]?.away ?? null,
                home_set2_score: match.sets[1]?.home ?? null,
                away_set2_score: match.sets[1]?.away ?? null,
                home_set3_score: match.sets[2]?.home ?? null,
                away_set3_score: match.sets[2]?.away ?? null,
                winner: winnerOf(
                    match.homeGames,
                    match.awayGames,
                    homeTeam,
                    awayTeam
                ),
                playoff: true
            })
            .returning({ id: matches.id })

        if (inserted.length === 0) {
            continue
        }

        if (homeTeam !== null && awayTeam !== null) {
            const won = match.homeGames > match.awayGames
            winnerOfMatch.set(match.matchNumber, won ? homeTeam : awayTeam)
            loserOfMatch.set(match.matchNumber, won ? awayTeam : homeTeam)
        }

        // home_source and away_source are NOT NULL. A table-era page that only
        // names the participants has no tokens, so it gets a matches row but
        // no meta row rather than a fabricated one.
        if (match.homeRef && match.awayRef) {
            await db.insert(playoffMatchesMeta).values({
                season: seasonId,
                division: divisionId,
                week,
                match_num: match.matchNumber,
                match_id: inserted[0].id,
                home_source: match.homeRef.token,
                away_source: match.awayRef.token,
                work_source: match.workRef?.token ?? null
            })
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
