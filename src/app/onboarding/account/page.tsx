import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { OnboardingAccountForm } from "./onboarding-account-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Complete Your Profile"
}

export default async function OnboardingAccountPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    // Check if already completed onboarding
    const [user] = await db
        .select({
            onboarding_completed: users.onboarding_completed,
            preffered_name: users.preffered_name,
            phone: users.phone,
            pronouns: users.pronouns,
            emergency_contact: users.emergency_contact,
            male: users.male,
            referred_by: users.referred_by
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
                <h1 className="text-2xl font-bold">Welcome! Let's set up your profile</h1>
                <p className="text-muted-foreground">
                    Tell us a bit more about yourself.
                </p>
            </div>
            <OnboardingAccountForm
                initialData={
                    user
                        ? {
                              preffered_name: user.preffered_name,
                              phone: user.phone,
                              pronouns: user.pronouns,
                              emergency_contact: user.emergency_contact,
                              male: user.male,
                              referred_by: user.referred_by
                          }
                        : null
                }
            />
        </div>
    )
}
