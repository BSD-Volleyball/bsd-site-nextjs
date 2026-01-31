import { PageHeader } from "@/components/layout/page-header"
import { getVolleyballProfile } from "./actions"
import { VolleyballProfileForm } from "./volleyball-profile-form"

export const metadata = {
    title: "Volleyball Profile"
}

export default async function VolleyballProfilePage() {
    const { profile } = await getVolleyballProfile()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Volleyball Profile"
                description="Update your volleyball skills and experience."
            />
            <div className="max-w-2xl">
                <VolleyballProfileForm initialData={profile} />
            </div>
        </div>
    )
}
