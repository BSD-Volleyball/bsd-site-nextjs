#!/usr/bin/env tsx
// Fills divisions where the database is missing teams the archive recorded.
//
// Three divisions came out short of what their season actually fielded:
//
//   S12 B    database has 1 of the archive's 4 teams (and no roster for it)
//   S12 BB   database has 1 of the archive's 4 teams (and no roster for it)
//   S23 AB   database has 7 of the archive's 8 teams
//
// The main importer will not touch these: it refuses to create a team in a
// division that already holds real teams (a guard added after an earlier run
// duplicated 51 of them), and it skips roster import entirely for seasons that
// already have rosters. Both guards are right in general and wrong for this
// specific case, so this fills the gaps surgically instead of relaxing them.
//
// Only ADDS. Existing teams and rosters are never modified, and a team that
// already has a roster is left alone.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fill-missing-teams.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fill-missing-teams.ts --apply

import "dotenv/config"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import { db } from "../src/database/db"
import {
    divisions,
    drafts,
    seasons,
    teams,
    users
} from "../src/database/schema"
import { GHOST_CAPTAIN_ID } from "../src/lib/ghost-captain"
import { loadInventory, loadSlice } from "./backfill/lib/load-slice"
import {
    HISTORICAL_ROUND,
    historicalOverall
} from "../src/lib/wayback/historical-pick"

const TARGETS = [
    { seasonCode: "S12", divisionCode: "b" },
    { seasonCode: "S12", divisionCode: "bb" },
    { seasonCode: "S23", divisionCode: "ab" }
]

const apply = process.argv.includes("--apply")
const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "")
const slug = (s: string) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")

async function main() {
    console.log(
        `mode: ${apply ? "APPLY (will write)" : "DRY RUN (read-only)"}\n`
    )

    const inventory = loadInventory(
        path.join(process.cwd(), "scripts", "data", "inventory.json")
    )

    const seasonRows = await db
        .select({ id: seasons.id, code: seasons.code })
        .from(seasons)
    const divisionRows = await db
        .select({
            id: divisions.id,
            name: divisions.name,
            level: divisions.level
        })
        .from(divisions)

    const userRows = await db
        .select({
            id: users.id,
            first: users.first_name,
            last: users.last_name,
            email: users.email
        })
        .from(users)
    const byFullName = new Map<string, string[]>()
    const byEmail = new Map<string, string>()
    for (const u of userRows) {
        const key = `${norm(u.first)}|${norm(u.last)}`
        byFullName.set(key, [...(byFullName.get(key) ?? []), u.id])
        byEmail.set(u.email.toLowerCase(), u.id)
    }

    const summary = {
        teamsCreated: 0,
        rostersAdded: 0,
        drafts: 0,
        usersCreated: 0
    }

    for (const target of TARGETS) {
        const seasonId = seasonRows.find(
            (s) => s.code === target.seasonCode
        )?.id
        const division = divisionRows.find(
            (d) => d.name.toLowerCase() === target.divisionCode
        )
        if (seasonId === undefined || division === undefined) {
            console.log(
                `${target.seasonCode}/${target.divisionCode}: unknown season/division`
            )
            continue
        }
        const divisionId = division.id

        const record = inventory.find(
            (r) =>
                r.seasonCode === target.seasonCode &&
                r.divisionCode === target.divisionCode &&
                r.kind === "roster"
        )
        if (!record) {
            console.log(
                `${target.seasonCode}/${target.divisionCode}: no archived roster page`
            )
            continue
        }

        const slice = loadSlice(record)
        const existing = await db
            .select({ id: teams.id, number: teams.number, name: teams.name })
            .from(teams)
            .where(
                and(eq(teams.season, seasonId), eq(teams.division, divisionId))
            )
        const byNumber = new Map(
            existing
                .filter((t) => t.number !== null)
                .map((t) => [t.number as number, t])
        )

        const overall = historicalOverall(
            division.level,
            slice.rosterTeams.length
        )
        console.log(
            `\n${target.seasonCode}/${target.divisionCode.toUpperCase()}: archive has ${slice.rosterTeams.length} teams, database has ${existing.length}`
        )

        for (const team of slice.rosterTeams) {
            const captain = team.players.find((p) => p.isCaptain)
            const captainName = captain?.lastName ?? `${team.teamNumber}`
            let teamId = byNumber.get(team.teamNumber)?.id

            // Resolve the captain's account first so a created team is not
            // stranded on the ghost captain when the real person is known.
            let captainId = GHOST_CAPTAIN_ID
            if (captain) {
                const hits =
                    byFullName.get(
                        `${norm(captain.firstName)}|${norm(captain.lastName)}`
                    ) ?? []
                if (hits.length === 1) {
                    captainId = hits[0]
                }
            }

            if (teamId === undefined) {
                console.log(
                    `  create team #${team.teamNumber} "Team ${captainName}" ` +
                        `(captain ${captainId === GHOST_CAPTAIN_ID ? "ghost" : "matched"})`
                )
                summary.teamsCreated++
                if (apply) {
                    const inserted = await db
                        .insert(teams)
                        .values({
                            season: seasonId,
                            division: divisionId,
                            captain: captainId,
                            name: `Team ${captainName}`,
                            number: team.teamNumber
                        })
                        .returning({ id: teams.id })
                    teamId = inserted[0]?.id
                }
            } else {
                const rosterCount = (
                    await db
                        .select({ id: drafts.id })
                        .from(drafts)
                        .where(eq(drafts.team, teamId))
                ).length
                if (rosterCount > 0) {
                    continue
                }
                console.log(
                    `  team #${team.teamNumber} "${byNumber.get(team.teamNumber)?.name}" exists but has no roster`
                )
            }

            summary.rostersAdded++
            for (const player of team.players) {
                const key = `${norm(player.firstName)}|${norm(player.lastName)}`
                const hits = byFullName.get(key) ?? []
                let userId: string

                if (hits.length === 1) {
                    userId = hits[0]
                } else {
                    const email = `legacy-roster-${slug(
                        `${player.firstName}-${player.lastName}-${target.seasonCode}-${team.teamNumber}`
                    )}@bumpsetdrink.com`
                    const found = byEmail.get(email)
                    if (found) {
                        userId = found
                    } else {
                        userId = randomUUID()
                        summary.usersCreated++
                        if (apply) {
                            await db.insert(users).values({
                                id: userId,
                                first_name: player.firstName,
                                last_name: player.lastName,
                                email
                            })
                            byEmail.set(email, userId)
                            byFullName.set(key, [...hits, userId])
                        }
                    }
                }

                summary.drafts++
                if (apply && teamId !== undefined) {
                    await db.insert(drafts).values({
                        team: teamId,
                        user: userId,
                        round: HISTORICAL_ROUND,
                        overall
                    })
                }
            }
        }
    }

    console.log("\n=== SUMMARY ===")
    for (const [k, v] of Object.entries(summary)) {
        console.log(`  ${k.padEnd(14)} ${v}`)
    }

    if (!apply) {
        console.log("\nDRY RUN -- nothing written. Re-run with --apply.")
        return
    }

    console.log("\nverification:")
    for (const target of TARGETS) {
        const seasonId = seasonRows.find(
            (s) => s.code === target.seasonCode
        )?.id
        const divisionId = divisionRows.find(
            (d) => d.name.toLowerCase() === target.divisionCode
        )?.id
        if (seasonId === undefined || divisionId === undefined) {
            continue
        }
        const rows = await db
            .select({ id: teams.id, number: teams.number })
            .from(teams)
            .where(
                and(eq(teams.season, seasonId), eq(teams.division, divisionId))
            )
        let withRoster = 0
        for (const r of rows) {
            const n = (
                await db
                    .select({ id: drafts.id })
                    .from(drafts)
                    .where(eq(drafts.team, r.id))
            ).length
            if (n > 0) {
                withRoster++
            }
        }
        console.log(
            `  ${target.seasonCode}/${target.divisionCode.toUpperCase()}: ${rows.length} teams, ${withRoster} with rosters`
        )
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
