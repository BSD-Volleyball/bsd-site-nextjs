"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { usePlayerDetailModal } from "@/components/player-detail/use-player-detail-modal"
import { AdminPlayerDetailPopup } from "@/components/player-detail/admin-player-detail-popup"
import {
    withdrawTournamentTeam,
    type OverviewTeam,
    type TournamentOverviewData
} from "./actions"

interface Props {
    data: TournamentOverviewData
    playerPicUrl: string
}

function formatTournamentDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    })
}

function structureSummary(t: TournamentOverviewData["tournament"]): string {
    const type = t.tournamentType === "reverse_coed" ? "Reverse coed" : "Coed"
    const elim =
        t.eliminationFormat === "double"
            ? "double elimination"
            : "single elimination"
    return `${type} · pool play (size ${t.poolSize}) → ${elim}`
}

function genderBadge(male: boolean | null): string {
    if (male === true) return "M"
    if (male === false) return "NM"
    return "—"
}

function TeamRow({
    team,
    onPlayerClick
}: {
    team: OverviewTeam
    onPlayerClick: (userId: string) => void
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const males = team.roster.filter((p) => p.male === true).length
    const nonMales = team.roster.filter((p) => p.male === false).length

    async function handleWithdraw() {
        setBusy(true)
        const result = await withdrawTournamentTeam(team.id)
        setBusy(false)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success(result.message ?? "Team withdrawn.")
        setConfirmOpen(false)
        router.refresh()
    }

    return (
        <div className="rounded-md border">
            <div className="flex items-center">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex flex-1 items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/50"
                >
                    <div className="flex items-center gap-2">
                        {open ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{team.name}</span>
                        <span className="text-muted-foreground text-sm">
                            — captain {team.captainName}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground text-xs">
                        <span>
                            {team.roster.length} players ({males}M / {nonMales}
                            NM)
                        </span>
                        {team.amountPaid && (
                            <span>${team.amountPaid} paid</span>
                        )}
                    </div>
                </button>
                <div className="pr-2 pl-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmOpen(true)}
                    >
                        Withdraw
                    </Button>
                </div>
            </div>
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Withdraw {team.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the team and its entire roster from the
                            tournament. It does <strong>not</strong> refund any
                            payment — refunds must be handled separately. This
                            can't be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                // Keep the dialog open until the action resolves
                                // so the user sees the busy state / any error.
                                e.preventDefault()
                                handleWithdraw()
                            }}
                            disabled={busy}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {busy ? "Withdrawing..." : "Withdraw Team"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {open && (
                <div className="divide-y border-t">
                    {team.roster.length === 0 ? (
                        <p className="px-4 py-2 text-muted-foreground text-sm">
                            No rostered players.
                        </p>
                    ) : (
                        team.roster.map((p) => (
                            <div
                                key={p.userId}
                                className="flex items-center justify-between px-4 py-1.5"
                            >
                                <button
                                    type="button"
                                    onClick={() => onPlayerClick(p.userId)}
                                    className="text-sm hover:underline focus:outline-none"
                                >
                                    {p.name}
                                    {p.isCaptain && (
                                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-primary text-xs">
                                            C
                                        </span>
                                    )}
                                </button>
                                <span className="text-muted-foreground text-xs">
                                    {genderBadge(p.male)}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

export function TournamentOverviewClient({ data, playerPicUrl }: Props) {
    const {
        selectedUserId,
        playerDetails,
        draftHistory,
        signupHistory,
        ratingAverages,
        sharedRatingNotes,
        privateRatingNotes,
        viewerRating,
        pairPickName,
        pairReason,
        isLoading: playerLoading,
        openPlayerDetail,
        closePlayerDetail
    } = usePlayerDetailModal()

    const t = data.tournament

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{t.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                    <p>{formatTournamentDate(t.tournamentDate)}</p>
                    <p className="text-muted-foreground">
                        {structureSummary(t)}
                    </p>
                    <p className="text-muted-foreground">
                        Phase: <span className="font-medium">{t.phase}</span>
                        {t.cost && (
                            <>
                                {" · "}Fee ${t.cost}
                                {t.lateCost && <> (late ${t.lateCost})</>}
                            </>
                        )}
                    </p>
                </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card>
                    <CardContent className="p-4">
                        <p className="text-muted-foreground text-xs uppercase">
                            Teams
                        </p>
                        <p className="font-bold text-2xl">
                            {data.totals.teamCount}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <p className="text-muted-foreground text-xs uppercase">
                            Rostered Players
                        </p>
                        <p className="font-bold text-2xl">
                            {data.totals.rosteredPlayerCount}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <p className="text-muted-foreground text-xs uppercase">
                            Divisions
                        </p>
                        <p className="font-bold text-2xl">
                            {data.divisions.length}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <p className="text-muted-foreground text-xs uppercase">
                            Waitlist (unplaced)
                        </p>
                        <p className="font-bold text-2xl">
                            {data.totals.waitlistCount}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {data.divisions.map((div) => (
                <Card key={div.id}>
                    <CardHeader>
                        <CardTitle className="flex items-baseline justify-between gap-2">
                            <span>{div.name}</span>
                            <span className="font-normal text-muted-foreground text-sm">
                                {div.teams.length} / {div.teamCap} teams · caps{" "}
                                {div.malePerTeam}M / {div.nonMalePerTeam}NM
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {div.teams.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No teams in this division yet.
                            </p>
                        ) : (
                            div.teams.map((team) => (
                                <TeamRow
                                    key={team.id}
                                    team={team}
                                    onPlayerClick={openPlayerDetail}
                                />
                            ))
                        )}
                    </CardContent>
                </Card>
            ))}

            {data.unassignedTeams.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Unassigned Teams</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {data.unassignedTeams.map((team) => (
                            <TeamRow
                                key={team.id}
                                team={team}
                                onPlayerClick={openPlayerDetail}
                            />
                        ))}
                    </CardContent>
                </Card>
            )}

            <AdminPlayerDetailPopup
                open={!!selectedUserId}
                onClose={closePlayerDetail}
                playerDetails={playerDetails}
                draftHistory={draftHistory}
                signupHistory={signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={playerLoading}
                pairPickName={pairPickName}
                pairReason={pairReason}
                ratingAverages={ratingAverages}
                sharedRatingNotes={sharedRatingNotes}
                privateRatingNotes={privateRatingNotes}
                viewerRating={viewerRating}
            />
        </div>
    )
}
