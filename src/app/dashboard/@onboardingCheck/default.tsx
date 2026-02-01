import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"

export default async function OnboardingCheckDefault() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (session?.user) {
        const [user] = await db
            .select({ onboarding_completed: users.onboarding_completed })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)

        if (user && !user.onboarding_completed) {
            redirect("/onboarding/account")
        }
    }

    return null
}
