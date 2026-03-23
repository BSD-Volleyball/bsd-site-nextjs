import { RulesContent } from "@/components/rules-content"

export const metadata = {
    title: "League Rules - Bump Set Drink Volleyball",
    description:
        "Official BSD Volleyball League rules and regulations for players, captains, and referees"
}

export default function DashboardRulesPage() {
    return (
        <div className="max-w-4xl">
            <RulesContent />
        </div>
    )
}
