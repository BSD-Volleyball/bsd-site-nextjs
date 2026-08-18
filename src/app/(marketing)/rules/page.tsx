import { RulesContent } from "@/components/rules-content"

export const metadata = {
    title: "League Rules - Bump Set Drink Volleyball",
    description:
        "Official BSD Volleyball League rules and regulations for players, captains, and referees"
}

export default function RulesPage() {
    return (
        <div className="container mx-auto max-w-3xl px-4 py-16">
            <RulesContent />
        </div>
    )
}
