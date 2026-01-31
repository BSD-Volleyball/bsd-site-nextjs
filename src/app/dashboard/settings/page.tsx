import {
    ChangeEmailCard,
    ChangePasswordCard,
    DeleteAccountCard,
    SessionsCard,
    UpdateFieldCard,
    UpdateAvatarCard,
    ProvidersCard
} from "@daveyplate/better-auth-ui"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RiUser3Line, RiShieldLine, RiAlarmWarningLine } from "@remixicon/react"
import { PageHeader } from "@/components/layout/page-header"
import { getAccountProfile } from "./actions"
import { AccountFieldCard } from "./account-field-card"

export const metadata = {
    title: "Settings"
}

export default async function SettingsPage() {
    const { profile } = await getAccountProfile()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Settings"
                description="Manage your account settings and preferences."
            />

            <Tabs
                defaultValue="account"
                className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:gap-8"
            >
                <TabsList className="flex h-auto w-full flex-row justify-start gap-2 bg-transparent p-0 lg:w-64 lg:flex-col lg:items-start lg:justify-start">
                    <TabsTrigger
                        value="account"
                        className="flex-1 justify-center gap-2 rounded-lg px-3 py-2 text-center text-sm data-[state=active]:bg-secondary lg:flex-none lg:justify-start lg:text-left lg:text-base"
                    >
                        <RiUser3Line className="h-4 w-4" />
                        <span className="hidden sm:inline">Account</span>
                        <span className="sm:hidden">Account</span>
                    </TabsTrigger>
                    <TabsTrigger
                        value="security"
                        className="flex-1 justify-center gap-2 rounded-lg px-3 py-2 text-center text-sm data-[state=active]:bg-secondary lg:flex-none lg:justify-start lg:text-left lg:text-base"
                    >
                        <RiShieldLine className="h-4 w-4" />
                        <span className="hidden sm:inline">Security</span>
                        <span className="sm:hidden">Security</span>
                    </TabsTrigger>
                </TabsList>

                <div className="min-w-0 max-w-2xl flex-1">
                    <TabsContent id="account" value="account">
                        <div className="space-y-4 sm:space-y-6">
                            <UpdateAvatarCard />
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
                    </TabsContent>

                    <TabsContent id="security" value="security">
                        <div className="space-y-4 sm:space-y-6">
                            <ChangePasswordCard />
                            <ProvidersCard />
                            <SessionsCard />
                        </div>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    )
}
