import "dotenv/config"
import { db } from "@/database/db"
import { resendSegments, drafts } from "@/database/schema"

async function main() {
    const segs = await db.select().from(resendSegments)
    console.log(
        "Segments in DB:",
        JSON.stringify(
            segs.map((s) => ({ type: s.segment_type, name: s.name })),
            null,
            2
        )
    )

    const draftCount = await db.select({ id: drafts.id }).from(drafts)
    console.log("Total draft rows:", draftCount.length)
    process.exit(0)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
