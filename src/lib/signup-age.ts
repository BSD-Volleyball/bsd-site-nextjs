import { and, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { signups } from "@/database/schema"
import { DEFAULT_AGE_GROUP } from "@/lib/age-groups"

/**
 * True when any signup on record already put this player in the adult age
 * group. Age only moves in one direction, so the signup wizard stops asking
 * these players their age and submits DEFAULT_AGE_GROUP for them.
 *
 * Kept out of `age-groups.ts` on purpose: that module is imported by client
 * components and must stay free of database imports.
 */
export async function hasRecordedAdultAge(userId: string): Promise<boolean> {
    const [row] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(
            and(eq(signups.player, userId), eq(signups.age, DEFAULT_AGE_GROUP))
        )
        .limit(1)
    return row !== undefined
}
