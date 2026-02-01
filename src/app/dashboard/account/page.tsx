import { ChangeEmailCard } from "@daveyplate/better-auth-ui"
import { PageHeader } from "@/components/layout/page-header"
import { getAccountProfile } from "../settings/actions"
import { AccountFieldCard } from "../settings/account-field-card"

export const metadata = {
    title: "Account"
}

export default async function AccountPage() {
    const { profile } = await getAccountProfile()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Account"
                description="Manage your account information."
            />

            <div className="max-w-2xl space-y-4 sm:space-y-6">
                <AccountFieldCard
                    name="first_name"
                    label="First Name"
                    description="Your first name."
                    initialValue={profile?.first_name ?? null}
                    placeholder="Enter your first name"
                />
                <AccountFieldCard
                    name="last_name"
                    label="Last Name"
                    description="Your last name."
                    initialValue={profile?.last_name ?? null}
                    placeholder="Enter your last name"
                />
                <AccountFieldCard
                    name="preffered_name"
                    label="Preferred Name"
                    description="The name you'd like to be called."
                    initialValue={profile?.preffered_name ?? null}
                    placeholder="Enter your preferred name"
                />
                <ChangeEmailCard />
                <AccountFieldCard
                    name="phone"
                    label="Phone Number"
                    description="Your contact phone number."
                    initialValue={profile?.phone ?? null}
                    placeholder="Enter your phone number"
                />
                <AccountFieldCard
                    name="pronouns"
                    label="Pronouns"
                    description="Your preferred pronouns."
                    initialValue={profile?.pronouns ?? null}
                    placeholder="e.g., they/them, she/her, he/him"
                />
                <AccountFieldCard
                    name="emergency_contact"
                    label="Emergency Contact"
                    description="Name and phone number of someone we can contact in case of emergency."
                    initialValue={profile?.emergency_contact ?? null}
                    placeholder="e.g., Jane Doe (wife) - 555-123-4567"
                />
            </div>
        </div>
    )
}
