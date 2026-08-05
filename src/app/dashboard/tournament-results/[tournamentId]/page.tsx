import { redirect } from "next/navigation"

// The single results page split into Roster / Pool Play / Playoffs
// (2026-08). Old links land on the Playoffs page, which carries the final
// rankings the results page used to lead with.
export default async function TournamentResultsRedirect({
    params
}: {
    params: Promise<{ tournamentId: string }>
}) {
    const { tournamentId } = await params
    redirect(`/dashboard/tournament-playoffs/${tournamentId}`)
}
