import "dotenv/config"
import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { and, eq, inArray, notExists } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { accounts, users } from "../src/database/schema"

// better-auth >= 1.6.11 only lets Google sign-in link into an existing user
// whose emailVerified is true (the fix for OAuth pre-account hijacking). The
// hijack needs an attacker-held credential on the row; a user with no auth
// account at all has none, so linking into it is safe. Those rows are mostly
// imported league players who claim their account by signing in with Google,
// and ~750 of them carry emailVerified=false. Without this backfill the
// upgrade would turn their first Google sign-in into "account not linked".
//
// Marks every credential-less, unverified user verified. Idempotent. Writes
// the affected ids to ~/backups first so the change can be reversed.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/verify-credentialless-users.ts [--apply]

async function main() {
    const apply = process.argv.includes("--apply")
    const db = drizzle(process.env.DATABASE_URL as string)

    const targets = await db
        .select({ id: users.id })
        .from(users)
        .where(
            and(
                eq(users.emailVerified, false),
                notExists(
                    db
                        .select({ id: accounts.id })
                        .from(accounts)
                        .where(eq(accounts.userId, users.id))
                )
            )
        )
    const ids = targets.map((t) => t.id)
    console.log(`${ids.length} credential-less unverified users.`)

    if (!apply) {
        console.log("Dry run; pass --apply to update.")
        return
    }
    if (ids.length === 0) return

    const dir = join(homedir(), "backups")
    mkdirSync(dir, { recursive: true })
    const file = join(
        dir,
        `verify-credentialless-users-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`
    )
    writeFileSync(file, JSON.stringify(ids, null, 2))
    console.log(`Saved ids to ${file}`)

    let updated = 0
    for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500)
        const rows = await db
            .update(users)
            .set({ emailVerified: true })
            .where(and(inArray(users.id, batch), eq(users.emailVerified, false)))
            .returning({ id: users.id })
        updated += rows.length
    }
    console.log(`Marked ${updated} users verified.`)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
