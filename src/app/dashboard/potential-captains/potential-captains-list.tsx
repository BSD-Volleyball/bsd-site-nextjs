"use client"

import { useState, useCallback, useEffect } from "react"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"

interface PotentialCaptain {
    id: string
    displayName: string
    lastName: string
    email: string
    consecutiveSeasons: number
    captainInterest: "yes" | "only_if_needed" | "no"
}

interface CaptainList {
    title: string
    description: string
    players: PotentialCaptain[]
}

interface DivisionCaptains {
    id: number
    name: string
    level: number
    lists: CaptainList[]
}

export function PotentialCaptainsList({
    divisions,
    allSeasons: _allSeasons,
    playerPicUrl,
    emailTemplate,
    emailSubject
}: {
    divisions: DivisionCaptains[]
    allSeasons: { id: number; year: number; name: string }[]
    playerPicUrl: string
    emailTemplate: string
    emailSubject: string
}) {
    const modal = usePlayerDetailModal()
    const [selectedPlayers, setSelectedPlayers] = useState<
        Map<number, Set<string>>
    >(new Map())
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [currentDivisionId, setCurrentDivisionId] = useState<number | null>(
        null
    )
    const [copySuccess, setCopySuccess] = useState(false)
    const [copyEmailSuccess, setCopyEmailSuccess] = useState(false)
    const [copySubjectSuccess, setCopySubjectSuccess] = useState(false)

    const togglePlayerSelection = (divisionId: number, playerId: string) => {
        setSelectedPlayers((prev) => {
            const newMap = new Map(prev)
            const currentSet = newMap.get(divisionId) || new Set()
            const newSet = new Set(currentSet)

            if (newSet.has(playerId)) {
                newSet.delete(playerId)
            } else {
                newSet.add(playerId)
            }
            newMap.set(divisionId, newSet)
            return newMap
        })
    }

    const handleGenerateMessage = (divisionId: number) => {
        setCurrentDivisionId(divisionId)
        setShowEmailModal(true)
        setCopySuccess(false)
        setCopyEmailSuccess(false)
        setCopySubjectSuccess(false)
    }

    const getSelectedPlayersForDivision = (
        divisionId: number
    ): PotentialCaptain[] => {
        const division = divisions.find((d) => d.id === divisionId)
        if (!division) return []

        const selectedIds = selectedPlayers.get(divisionId) || new Set()
        const allPlayers: PotentialCaptain[] = []

        division.lists.forEach((list) => {
            allPlayers.push(...list.players)
        })

        return allPlayers.filter((p) => selectedIds.has(p.id))
    }

    const formatEmailList = (players: PotentialCaptain[]): string => {
        return players
            .map((p) => `${p.displayName} ${p.lastName} <${p.email}>`)
            .join(", ")
    }

    const handleCopyToClipboard = async () => {
        if (!currentDivisionId) return

        const players = getSelectedPlayersForDivision(currentDivisionId)
        const emailList = formatEmailList(players)

        try {
            await navigator.clipboard.writeText(emailList)
            setCopySuccess(true)
            setTimeout(() => setCopySuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy to clipboard:", err)
        }
    }

    const handleCopyEmailTemplate = async () => {
        try {
            await navigator.clipboard.writeText(emailTemplate)
            setCopyEmailSuccess(true)
            setTimeout(() => setCopyEmailSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy email template to clipboard:", err)
        }
    }

    const handleCopySubject = async () => {
        try {
            await navigator.clipboard.writeText(emailSubject)
            setCopySubjectSuccess(true)
            setTimeout(() => setCopySubjectSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy subject to clipboard:", err)
        }
    }

    const handleCloseEmailModal = useCallback(() => {
        setShowEmailModal(false)
    }, [])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && showEmailModal) {
                handleCloseEmailModal()
            }
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [showEmailModal, handleCloseEmailModal])

    return (
        <div className="space-y-4">
            {divisions.map((division) => (
                <Collapsible key={division.id}>
                    <div className="rounded-lg border bg-card shadow-sm">
                        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50">
                            <h2 className="font-semibold text-xl">
                                {division.name}
                            </h2>
                            <RiArrowDownSLine
                                className="transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                                size={20}
                            />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="space-y-6 border-t px-4 pt-4 pb-4">
                                {division.lists.map((list, index) => (
                                    <div key={index}>
                                        <h3 className="mb-2 font-semibold text-base">
                                            {list.title}
                                        </h3>
                                        <p className="mb-3 text-muted-foreground text-sm">
                                            {list.description}
                                        </p>
                                        {list.players.length === 0 ? (
                                            <div className="rounded-md bg-muted p-4 text-center text-muted-foreground text-sm">
                                                No players in this category.
                                            </div>
                                        ) : (
                                            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                                {list.players.map((player) => (
                                                    <div
                                                        key={player.id}
                                                        className="flex items-center gap-2 rounded-md border bg-background p-3"
                                                    >
                                                        <Checkbox
                                                            checked={
                                                                selectedPlayers
                                                                    .get(
                                                                        division.id
                                                                    )
                                                                    ?.has(
                                                                        player.id
                                                                    ) || false
                                                            }
                                                            onCheckedChange={() =>
                                                                togglePlayerSelection(
                                                                    division.id,
                                                                    player.id
                                                                )
                                                            }
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                modal.openPlayerDetail(
                                                                    player.id
                                                                )
                                                            }
                                                            className="flex flex-1 items-center justify-between transition-colors hover:text-primary focus:outline-none"
                                                        >
                                                            <span className="text-sm">
                                                                {
                                                                    player.displayName
                                                                }{" "}
                                                                {
                                                                    player.lastName
                                                                }
                                                            </span>
                                                            <Badge variant="secondary">
                                                                {player.consecutiveSeasons >=
                                                                10
                                                                    ? "9+"
                                                                    : player.consecutiveSeasons}{" "}
                                                                {player.consecutiveSeasons ===
                                                                1
                                                                    ? "season"
                                                                    : "seasons"}
                                                            </Badge>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-6 flex justify-end border-t px-4 py-4">
                                <Button
                                    onClick={() =>
                                        handleGenerateMessage(division.id)
                                    }
                                    disabled={
                                        !selectedPlayers.get(division.id) ||
                                        selectedPlayers.get(division.id)!
                                            .size === 0
                                    }
                                    variant="default"
                                >
                                    Generate Message (
                                    {selectedPlayers.get(division.id)?.size ||
                                        0}{" "}
                                    selected)
                                </Button>
                            </div>
                        </CollapsibleContent>
                    </div>
                </Collapsible>
            ))}

            <AdminPlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                signupHistory={modal.signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={modal.pairPickName}
                pairReason={modal.pairReason}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
            />

            {/* Email Modal */}
            {showEmailModal && currentDivisionId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={handleCloseEmailModal}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") handleCloseEmailModal()
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <div
                        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="document"
                    >
                        <button
                            type="button"
                            onClick={handleCloseEmailModal}
                            className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RiCloseLine className="h-5 w-5" />
                        </button>
                        <h3 className="mb-4 font-semibold text-lg">
                            Email Recipients
                        </h3>
                        <Card className="mb-4 p-4">
                            <p className="mb-2 text-sm">
                                {formatEmailList(
                                    getSelectedPlayersForDivision(
                                        currentDivisionId
                                    )
                                )}
                            </p>
                            <Button
                                size="sm"
                                onClick={handleCopyToClipboard}
                                variant="outline"
                            >
                                {copySuccess
                                    ? "Copied!"
                                    : "Copy Email Addresses"}
                            </Button>
                        </Card>
                        {emailSubject && (
                            <Card className="mb-4 p-4">
                                <h4 className="mb-2 font-medium text-sm">
                                    Subject
                                </h4>
                                <p className="mb-2 text-sm">{emailSubject}</p>
                                <Button
                                    size="sm"
                                    onClick={handleCopySubject}
                                    variant="outline"
                                >
                                    {copySubjectSuccess
                                        ? "Copied!"
                                        : "Copy Subject"}
                                </Button>
                            </Card>
                        )}
                        {emailTemplate && (
                            <Card className="p-4">
                                <h4 className="mb-2 font-medium text-sm">
                                    Email Template
                                </h4>
                                <pre className="mb-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                                    {emailTemplate}
                                </pre>
                                <Button
                                    size="sm"
                                    onClick={handleCopyEmailTemplate}
                                    variant="outline"
                                >
                                    {copyEmailSuccess
                                        ? "Copied!"
                                        : "Copy Email Template"}
                                </Button>
                            </Card>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
