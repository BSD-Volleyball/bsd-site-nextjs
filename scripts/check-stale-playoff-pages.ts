#!/usr/bin/env tsx
// Detects playoff pages that describe a different season than the one they are
// filed under.
//
// JS-era playoff pages never name their participants -- they reference seed
// slots -- so the surname-overlap test that catches stale older pages cannot
// see them. They DO carry their own `teams` array though, and seed references
// resolve through TEAM NUMBERS, so if that array disagrees with the season's
// standings page then every match in the bracket has been attributed to the
// wrong team.
//
// This found a whole season: all five Spring 2017 playoff files are
// byte-identical to Summer 2017's and match Summer's standings 100%. Spring
// 2017's real playoff results are simply not in the archive.
//
// Reading the output: one or two mismatched slots is a naming difference
// ("Feliksik"/"Felisik", "Thakker"/"Thakkar", a nickname where the other page
// gives the captain) and is harmless. Most or all slots mismatching, or a
// different team COUNT, means the page belongs to another season.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-stale-playoff-pages.ts
//
// Read-only. Confirmed offenders go in scripts/backfill/excluded-slices.json.

import "dotenv/config"
import path from "node:path"
import { loadInventory, loadSlice } from "./backfill/lib/load-slice"

const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "")

async function main() {
    const inventory = loadInventory(
        path.join(process.cwd(), "scripts", "data", "inventory.json")
    )

    let checked = 0
    const bad: string[] = []

    for (const record of inventory.filter(
        (r) => r.kind === "playoff" && r.era.startsWith("js")
    )) {
        const standings = inventory.find(
            (r) =>
                r.kind === "standings" &&
                r.seasonCode === record.seasonCode &&
                r.divisionCode === record.divisionCode
        )
        if (!standings) {
            continue
        }

        const po = loadSlice(record).teamCaptains
        const st = loadSlice(standings).teamCaptains
        if (po.size === 0 || st.size === 0) {
            continue
        }
        checked++

        // Compare number -> name, both directions.
        const mismatches: string[] = []
        for (const [number, name] of po) {
            const other = st.get(number)
            if (!other || norm(other) !== norm(name)) {
                mismatches.push(
                    `#${number} playoff="${name}" standings="${other ?? "-"}"`
                )
            }
        }
        const sizeDiff = po.size !== st.size

        if (mismatches.length > 0 || sizeDiff) {
            bad.push(record.key)
            console.log(
                `\n  ${record.key}  (playoff ${po.size} teams, standings ${st.size} teams)`
            )
            console.log(
                `     playoff  : ${[...po.entries()]
                    .sort((a, b) => a[0] - b[0])
                    .map(([n, c]) => `#${n} ${c}`)
                    .join("  ")}`
            )
            console.log(
                `     standings: ${[...st.entries()]
                    .sort((a, b) => a[0] - b[0])
                    .map(([n, c]) => `#${n} ${c}`)
                    .join("  ")}`
            )
            console.log(`     mismatched slots: ${mismatches.length}`)
        }
    }

    console.log(
        `\nJS-era playoff slices checked: ${checked}, disagreeing with their own standings: ${bad.length}`
    )
    console.log(bad.join("\n"))
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
