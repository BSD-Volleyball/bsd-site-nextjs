import "server-only"

import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { withAction, ok, requireSession } from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"
import type { AccountProfileData } from "./actions"

export const getAccountProfile = withAction(
    async (): Promise<ActionResult<AccountProfileData | null>> => {
        const session = await requireSession()

        const [user] = await db
            .select({
                first_name: users.first_name,
                last_name: users.last_name,
                preferred_name: users.preferred_name,
                email: users.email,
                phone: users.phone,
                emergency_contact: users.emergency_contact,
                pronouns: users.pronouns
            })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)

        return ok(user || null)
    }
)
