#!/usr/bin/env tsx
// Folds the two `legacy-roster-*` placeholders left holding Spring 2023 AB
// roster slots into the real members they stand for.
//
// Both were invented by the archive backfill because the roster page prints
// only a name, and neither name matched an existing account closely enough for
// the automatic linker. The evidence for each is a career gap that the
// placeholder fills exactly:
//
//   Erika Frua   -> Abigail "Abi" Frua, erikaabigailf@gmail.com
//                   real account runs F22/BBB -> [S23 absent] -> U23/A -> F23/AA
//                   and the address itself reads "erika abigail f"
//
//   JoAnn Pessagno -> Jo Ann Pessagno, joann423@gmail.com
//                   real account captains AB in S19, F19, F21, S22 then stops;
//                   the placeholder holds S23/AB team 8's captaincy, and the
//                   archive page spells her "Pessagno, Jo Ann (Capt)". The
//                   merge also recovers an F11/BBB row stranded on it.
//
// Uses mergeUserRecords -- the same routine behind the admin merge UI -- so
// every non-cascading FK is repointed identically. copyIdentity is false
// because a placeholder's `old_id` and null picture must never overwrite the
// real member's (see MergeUserRecordsOptions).
//
// Run AFTER fix-s23-ab-draft-order.ts: that script matches on the names the
// placeholders currently carry, and this one only repoints the resulting rows.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/merge-s23-ab-legacy-accounts.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/merge-s23-ab-legacy-accounts.ts --apply
//
// Read-only unless --apply. Idempotent: the placeholders are gone afterwards.

import "dotenv/config"
import { eq, inArray } from "drizzle-orm"
import { db } from "../src/database/db"
import { drafts, teams, users } from "../src/database/schema"
import { mergeUserRecords } from "../src/lib/merge-users"

const MERGES = [
    {
        legacyId: "7e6b1cf7-f41d-4326-a507-ab23f1c73620",
        legacyEmail: "legacy-roster-erika-frua-s23-7@bumpsetdrink.com",
        realId: "S2F2K68WXdzJcpNLcNE3D9JjsUvrag2G",
        realEmail: "erikaabigailf@gmail.com"
    },
    {
        legacyId: "0b0323ff-2385-47a1-b167-7fbcbebddd2e",
        legacyEmail: "legacy-roster-joann-pessagno-f11-1@bumpsetdrink.com",
        realId: "7mAgPZJxRyUrxxMsjnr2ywVF4j232ZnD",
        realEmail: "joann423@gmail.com"
    }
]

const apply = process.argv.includes("--apply")

async function main() {
    console.log(
        `mode: ${apply ? "APPLY (will write)" : "DRY RUN (read-only)"}\n`
    )

    for (const m of MERGES) {
        const rows = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(inArray(users.id, [m.legacyId, m.realId]))

        const legacy = rows.find((r) => r.id === m.legacyId)
        const real = rows.find((r) => r.id === m.realId)

        if (!legacy) {
            console.log(`${m.legacyEmail}: already merged, skipping\n`)
            continue
        }
        // Identity guard: ids are opaque, so confirm both rows are who this
        // script was written for before collapsing one into the other.
        if (legacy.email !== m.legacyEmail)
            throw new Error(
                `${m.legacyId} is ${legacy.email}, expected ${m.legacyEmail}`
            )
        if (!real) throw new Error(`survivor ${m.realId} not found`)
        if (real.email !== m.realEmail)
            throw new Error(
                `${m.realId} is ${real.email}, expected ${m.realEmail}`
            )

        const carried = await db
            .select({ id: drafts.id })
            .from(drafts)
            .where(eq(drafts.user, m.legacyId))
        const captaincies = await db
            .select({ id: teams.id })
            .from(teams)
            .where(eq(teams.captain, m.legacyId))

        console.log(
            `${legacy.email}\n  -> ${real.email}\n` +
                `     ${carried.length} draft row(s), ${captaincies.length} captaincy(ies)`
        )

        if (apply) {
            await mergeUserRecords(m.legacyId, m.realId, {
                copyIdentity: false
            })
            console.log("     merged")
        }
        console.log()
    }

    if (!apply) console.log("Dry run. Re-run with --apply to write.")
}

main().catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
})
