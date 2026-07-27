"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose
} from "@/components/ui/dialog"
import { saveDraftHomework } from "./actions"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { getPlayerDetailsPublic } from "@/app/dashboard/view-signups/actions"
import type { DraftHomeworkData } from "./actions"
import {
    CONSIDERING_ROUND,
    buildInitialSelections,
    parseGenderSplit,
    type Selections
} from "./homework-selections"
import { PrintTabSection } from "./print-layout"
import { HomeworkTabContent } from "./homework-tab-content"

interface DraftHomeworkFormProps {
    data: DraftHomeworkData
    playerPicUrl: string
}

export function DraftHomeworkForm({
    data,
    playerPicUrl
}: DraftHomeworkFormProps) {
    const router = useRouter()
    const [selections, setSelections] = useState<Selections>(() =>
        buildInitialSelections(data)
    )
    const [saving, setSaving] = useState(false)
    const [showIncompleteDialog, setShowIncompleteDialog] = useState(false)
    const modal = usePlayerDetailModal({ fetchFn: getPlayerDetailsPublic })

    const [maleRounds, nonMaleRounds] = parseGenderSplit(data.genderSplit)
    const draftedSet = useMemo(
        () => new Set(data.draftedPlayerIds),
        [data.draftedPlayerIds]
    )
    const draftedIds = data.draftedPlayerIds

    const handleChange = (key: string, userId: string | null) => {
        setSelections((prev) => ({ ...prev, [key]: userId }))
    }

    const handleSave = async () => {
        const hasInvalid = Object.values(selections).some(
            (uid) => uid && draftedSet.has(uid)
        )
        if (hasInvalid) {
            toast.error(
                "Please remove or replace drafted players (highlighted in red) before saving."
            )
            return
        }

        setSaving(true)
        try {
            const selectionEntries = Object.entries(selections)
                .filter(([, userId]) => userId !== null)
                .map(([key, userId]) => {
                    const parts = key.split("-")
                    const tabKey = parts[0]
                    const round = parseInt(parts[1], 10)
                    const slot = parseInt(parts[2], 10)
                    return {
                        round,
                        slot,
                        playerId: userId as string,
                        isMaleTab: tabKey === "m"
                    }
                })

            const result = await saveDraftHomework({
                selections: selectionEntries
            })

            if (result.status) {
                // Check if all required round slots are filled (excluding Considering)
                const requiredSlots =
                    (maleRounds + nonMaleRounds) * data.numTeams
                const filledRequiredSlots = selectionEntries.filter(
                    (s) => s.round !== CONSIDERING_ROUND
                ).length
                if (filledRequiredSlots < requiredSlots) {
                    setShowIncompleteDialog(true)
                } else {
                    toast.success(result.message)
                }
                router.refresh()
            } else {
                toast.error(result.message)
            }
        } finally {
            setSaving(false)
        }
    }

    const hasExisting = data.existingSelections.length > 0

    return (
        <>
            <style>{`@media print { @page { size: letter portrait; margin: 0.25in 0.5in 0.5in 0.5in; } }`}</style>

            {/* ── Print-only layout ── */}
            <div
                className="hidden print:block"
                style={{ fontFamily: "sans-serif" }}
            >
                <div style={{ breakAfter: "page" }}>
                    <PrintTabSection
                        tabKey="m"
                        numRounds={maleRounds}
                        players={data.malePlayers}
                        selections={selections}
                        playerPicUrl={playerPicUrl}
                    />
                </div>
                <div>
                    <PrintTabSection
                        tabKey="f"
                        numRounds={nonMaleRounds}
                        players={data.nonMalePlayers}
                        selections={selections}
                        playerPicUrl={playerPicUrl}
                    />
                </div>
            </div>

            {/* ── Screen layout ── */}
            <div className="space-y-4 print:hidden">
                {data.lastUpdatedAt && (
                    <p className="text-muted-foreground text-sm">
                        Last saved:{" "}
                        {new Date(data.lastUpdatedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit"
                        })}
                    </p>
                )}

                <div className="flex items-center gap-3 rounded-md border bg-card p-4">
                    <p className="flex-1 text-muted-foreground text-sm">
                        Division:{" "}
                        <span className="font-medium text-foreground">
                            {data.divisionName}
                        </span>
                        {" · "}
                        {data.numTeams} teams ({data.genderSplit} split)
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.print()}
                    >
                        Print
                    </Button>
                    {/* Last Season's Draft button — temporarily hidden, re-enable when needed
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenLastSeasonDraft}
                >
                    Last Season&apos;s Draft
                </Button>
                */}
                </div>

                {/* Last Season's Draft dialog — temporarily hidden, re-enable when needed
            <Dialog
                open={lastSeasonDraftOpen}
                onOpenChange={setLastSeasonDraftOpen}
            >
                <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {lastSeasonDraft
                                ? `${lastSeasonDraft.divisionName} Division — ${lastSeasonDraft.seasonName.charAt(0).toUpperCase()}${lastSeasonDraft.seasonName.slice(1)} ${lastSeasonDraft.seasonYear} Draft`
                                : "Last Season's Draft"}
                        </DialogTitle>
                    </DialogHeader>

                    {lastSeasonDraftLoading && (
                        <p className="py-6 text-center text-muted-foreground text-sm">
                            Loading...
                        </p>
                    )}

                    {lastSeasonDraftError && !lastSeasonDraftLoading && (
                        <p className="py-6 text-center text-muted-foreground text-sm">
                            {lastSeasonDraftError}
                        </p>
                    )}

                    {lastSeasonDraft && !lastSeasonDraftLoading && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr>
                                        <th className="w-16 py-2 pr-4 text-left font-medium text-muted-foreground">
                                            Round
                                        </th>
                                        {lastSeasonDraft.teams.map((team) => {
                                            const captainName =
                                                team.captainPreferredName ??
                                                team.captainFirstName
                                            return (
                                                <th
                                                    key={team.teamId}
                                                    className="min-w-32 px-2 py-2 text-left font-medium"
                                                >
                                                    <span className="block truncate">
                                                        {captainName}{" "}
                                                        {team.captainLastName}
                                                    </span>
                                                    {team.teamName && (
                                                        <span className="block truncate font-normal text-muted-foreground text-xs">
                                                            {team.teamName}
                                                        </span>
                                                    )}
                                                </th>
                                            )
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from(
                                        { length: lastSeasonDraft.numRounds },
                                        (_, i) => i + 1
                                    ).map((round) => (
                                        <tr
                                            key={round}
                                            className="border-border/50 border-t"
                                        >
                                            <td className="py-1.5 pr-4 font-medium text-muted-foreground">
                                                {round}
                                            </td>
                                            {lastSeasonDraft.teams.map(
                                                (team) => {
                                                    const pick =
                                                        team.picks.find(
                                                            (p) =>
                                                                p.round ===
                                                                round
                                                        )
                                                    return (
                                                        <td
                                                            key={team.teamId}
                                                            className={`px-2 py-1.5 ${pick?.playerMale === false ? "text-pink-700 dark:text-pink-400" : ""}`}
                                                        >
                                                            {pick
                                                                ? formatDisplayName(pick.playerFirstName, pick.playerLastName, pick.playerPreferredName)
                                                                : "—"}
                                                        </td>
                                                    )
                                                }
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Close</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            */}

                <Tabs defaultValue="males">
                    <TabsList>
                        <TabsTrigger
                            value="males"
                            className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 dark:data-[state=active]:bg-blue-900/40 dark:data-[state=active]:text-blue-300"
                        >
                            Males ({maleRounds} rounds)
                        </TabsTrigger>
                        <TabsTrigger
                            value="non-males"
                            className="data-[state=active]:bg-pink-100 data-[state=active]:text-pink-800 dark:data-[state=active]:bg-pink-900/40 dark:data-[state=active]:text-pink-300"
                        >
                            Non-Males ({nonMaleRounds} rounds)
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="males">
                        <HomeworkTabContent
                            tabKey="m"
                            numRounds={maleRounds}
                            numTeams={data.numTeams}
                            players={data.malePlayers}
                            suggestedPlayers={data.suggestedMalePlayers}
                            selections={selections}
                            draftedIds={draftedIds}
                            playerPicUrl={playerPicUrl}
                            onChange={handleChange}
                            onOpenPlayer={modal.openPlayerDetail}
                        />
                    </TabsContent>

                    <TabsContent value="non-males">
                        <HomeworkTabContent
                            tabKey="f"
                            numRounds={nonMaleRounds}
                            numTeams={data.numTeams}
                            players={data.nonMalePlayers}
                            suggestedPlayers={data.suggestedNonMalePlayers}
                            selections={selections}
                            draftedIds={draftedIds}
                            playerPicUrl={playerPicUrl}
                            onChange={handleChange}
                            onOpenPlayer={modal.openPlayerDetail}
                        />
                    </TabsContent>
                </Tabs>

                <div className="flex items-center gap-3 pt-2">
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : hasExisting ? "Update" : "Save"}
                    </Button>
                </div>

                <Dialog
                    open={showIncompleteDialog}
                    onOpenChange={setShowIncompleteDialog}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                Homework Saved — Not Yet Complete
                            </DialogTitle>
                            <DialogDescription>
                                Your selections have been saved, but your draft
                                homework is not complete until all round slots
                                are filled for both the Males and Non-Males
                                tabs. The Considering section is optional.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button>Got it</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <PlayerDetailPopup
                    open={!!modal.selectedUserId}
                    onClose={modal.closePlayerDetail}
                    playerDetails={modal.playerDetails}
                    draftHistory={modal.draftHistory}
                    allSeasons={data.allSeasons}
                    playerPicUrl={playerPicUrl}
                    isLoading={modal.isLoading}
                    pairPickName={modal.pairPickName}
                    pairReason={modal.pairReason}
                    datesMissing={modal.unavailableDates}
                    playoffDates={modal.playoffDates}
                    ratingAverages={modal.ratingAverages}
                    sharedRatingNotes={modal.sharedRatingNotes}
                    privateRatingNotes={modal.privateRatingNotes}
                    viewerRating={modal.viewerRating}
                />
            </div>
        </>
    )
}
