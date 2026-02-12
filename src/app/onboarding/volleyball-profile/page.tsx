import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { OnboardingVolleyballForm } from "./onboarding-volleyball-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Volleyball Profile"
}

export default async function OnboardingVolleyballProfilePage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    // Check if already completed onboarding
    const [user] = await db
        .select({
            onboarding_completed: users.onboarding_completed,
            experience: users.experience,
            assessment: users.assessment,
            height: users.height,
            skill_passer: users.skill_passer,
            skill_setter: users.skill_setter,
            skill_hitter: users.skill_hitter,
            skill_other: users.skill_other
        })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)

    if (user?.onboarding_completed) {
        redirect("/dashboard")
    }

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h1 className="font-bold text-2xl">Almost there!</h1>
                <p className="text-muted-foreground">
                    Tell us about your volleyball experience and skills.
                </p>
            </div>
            <OnboardingVolleyballForm
                initialData={
                    user
                        ? {
                              experience: user.experience,
                              assessment: user.assessment,
                              height: user.height,
                              skill_passer: user.skill_passer ?? false,
                              skill_setter: user.skill_setter ?? false,
                              skill_hitter: user.skill_hitter ?? false,
                              skill_other: user.skill_other ?? false
                          }
                        : null
                }
            />
        </div>
    )
}
