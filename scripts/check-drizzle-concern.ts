import { db } from "@/database/db"
import { concerns } from "@/database/schema"
import { eq } from "drizzle-orm"

async function main() {
    const [concern] = await db
        .select()
        .from(concerns)
        .where(eq(concerns.id, 20))
        .limit(1)

    console.log("concern.source:", JSON.stringify(concern.source))
    console.log("concern.person_involved:", JSON.stringify(concern.person_involved))
    console.log("source === 'email':", concern.source === "email")
    
    const baseSubject =
        concern.source === "email" && concern.person_involved
            ? concern.person_involved.replace(/^(Re:\s*)+/i, "").trim()
            : `Concern #${concern.id}`
    console.log("computed subject:", `Re: ${baseSubject}`)
    process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
