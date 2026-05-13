import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { eq } from "drizzle-orm"
import { waivers } from "../src/database/schema"

// Idempotent seed of the initial (v1) waiver row. Pulls the exact prose that
// has been shown in the pay-season wizard to date. If a row already exists in
// the waivers table this script exits without doing anything — re-running it
// will never produce a second v1.

const V1_CONTENT = `By checking the "I Agree" box below, I hereby release, waive, discharge, and covenant not to sue, or hold responsible, Bump Set Drink, Inc. (BSD), Adventist HealthCare Fieldhouse referees, other participants, and any persons in a playing area, from all liability to you, your personal representatives, assigned heirs, and next of kin for any and all damage, and any claim or demands thereof on account of injury to you or your property or resulting in your death, whether caused by the negligence or otherwise while you are participating or working for or observing BSD events. You expressly acknowledge and agree that the activities at the event and in the playing areas are dangerous and involve the risk of serious injury and/or death and/or property damage. You expressly acknowledge that the activities at the event may involve the risk of exposure to Covid-19 or other harmful viruses. You consent to and will permit emergency medical treatment if required. You agree to allow your image to be used in promotional and informational material. You have read and agree to abide by the behavioral policies stated on the BSD website. You understand that this waiver may serve as the only warning to action being taken for improper behavior. You have read and voluntarily sign this release and waiver of liability and indemnity agreement which embraces each and every event sanctioned, authorized or promoted by the Bump Set Drink, Inc. league.

Submitting this online registration implies compliance with the waiver and your agreement to adhere to league rules as stated on the website. This statement qualifies as the only warning given — violations of the rules will not be tolerated. By registering for this league you will be held accountable for all league policies and procedures.`

async function main() {
    const db = drizzle(process.env.DATABASE_URL!)

    const existing = await db.select({ id: waivers.id }).from(waivers).limit(1)
    if (existing.length > 0) {
        console.log(
            `waivers table already has rows (id=${existing[0].id}); skipping seed.`
        )
        return
    }

    const [inserted] = await db
        .insert(waivers)
        .values({
            content: V1_CONTENT,
            active: true,
            created_at: new Date()
        })
        .returning({ id: waivers.id })

    console.log(`Seeded v1 waiver as id=${inserted.id}, active=true.`)

    // Sanity check: confirm exactly one active row.
    const actives = await db
        .select({ id: waivers.id })
        .from(waivers)
        .where(eq(waivers.active, true))
    if (actives.length !== 1) {
        throw new Error(
            `Expected exactly 1 active waiver, found ${actives.length}`
        )
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
