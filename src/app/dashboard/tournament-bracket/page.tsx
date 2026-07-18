import { redirect } from "next/navigation"

// The tournament bracket now lives on the combined, player-facing
// Schedule & Bracket page. Keep this route as a redirect so existing links
// and bookmarks still resolve.
export default function TournamentBracketPage() {
    redirect("/dashboard/tournament-schedule-view")
}
