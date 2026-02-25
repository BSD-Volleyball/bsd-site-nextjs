import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function CreateTeamsRedirectPage() {
    redirect("/dashboard/select-captains")
}
