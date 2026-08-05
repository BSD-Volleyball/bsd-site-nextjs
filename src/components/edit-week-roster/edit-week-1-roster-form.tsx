"use client"

// Week-1 roster editor layout: sessions 1-2 × courts 1-4, an alternates
// card (session 3), and an unassigned-player pool. Week 1 assigns each
// player at most one slot (unlike weeks 2/3, where "playing twice" is
// allowed), so duplicates are rejected before saving and already-assigned
// players are excluded from the comboboxes.

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn, formatDisplayName } from "@/lib/utils"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import {
    RosterNotificationDialog,
    type RosterChangeEntry
} from "@/components/roster-notification"
import type { ComboboxPlayer } from "./player-combobox"
import { SlotBox } from "./slot-box"
import { useRosterEditor } from "./use-roster-editor"

export interface Week1RosterPlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    placementScore: number
    playFirstWeek: boolean
    seasonsPlayed: number
    hasPairPick: boolean
}

export interface Week1RosterSlot {
    id: number
    sessionNumber: number
    courtNumber: number
    userId: string
}

export interface Week1RosterEntryPayload {
    sessionNumber: number
    courtNumber: number
    userId: string
}

export interface Week1NotificationAssignment {
    userId: string
    sessionNumber: number
    courtNumber: number
}

interface EditWeek1RosterFormProps {
    players: Week1RosterPlayer[]
    slots: Week1RosterSlot[]
    playerPicUrl: string
    seasonLabel: string
    updateRosters: (
        entries: Week1RosterEntryPayload[]
    ) => Promise<{ status: boolean; message?: string }>
    sendNotifications: (
        assignments: Week1NotificationAssignment[],
        removedUserIds: string[],
        seasonLabel: string
    ) => Promise<unknown>
}

interface LocalSlot {
    localKey: string
    sessionNumber: number
    courtNumber: number
    userId: string
}

const COURT_NUMBERS = [1, 2, 3, 4]
const ALTERNATE_SESSION = 3

function getPoolPlayerLabel(player: Week1RosterPlayer) {
    const name = formatDisplayName(
        player.firstName,
        player.lastName,
        player.preferredName
    )
    return `${name} (${Math.round(player.placementScore)})`
}

function UnassignedWeek1Players({
    players,
    assignedUserIds,
    onPlayerClick
}: {
    players: Week1RosterPlayer[]
    assignedUserIds: string[]
    onPlayerClick: (userId: string) => void
}) {
    const unassigned = useMemo(
        () =>
            players
                .filter(
                    (p) => p.playFirstWeek && !assignedUserIds.includes(p.id)
                )
                .sort((a, b) => {
                    return a.placementScore - b.placementScore
                }),
        [players, assignedUserIds]
    )

    if (unassigned.length === 0) return null

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    Unassigned Week 1 Players ({unassigned.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-2">
                    {unassigned.map((player) => (
                        <button
                            key={player.id}
                            type="button"
                            onClick={() => onPlayerClick(player.id)}
                            className={cn(
                                "rounded-md border px-2 py-1 text-left text-sm transition-opacity hover:opacity-80",
                                player.male === true
                                    ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40"
                                    : player.male === false
                                      ? "border-pink-300 bg-pink-50 dark:border-pink-800 dark:bg-pink-950/40"
                                      : "border-border bg-muted"
                            )}
                        >
                            {getPoolPlayerLabel(player)}
                            <span className="ml-1.5 text-muted-foreground text-xs">
                                {player.seasonsPlayed === 0
                                    ? "new"
                                    : `${player.seasonsPlayed}s`}
                            </span>
                        </button>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}

function computeWeek1Diff(
    oldSlots: LocalSlot[],
    newSlots: LocalSlot[],
    players: Week1RosterPlayer[]
): RosterChangeEntry[] {
    const playerName = (userId: string) => {
        const p = players.find((pl) => pl.id === userId)
        if (!p) return userId
        return formatDisplayName(p.firstName, p.lastName, p.preferredName)
    }

    const oldByUser = new Map(
        oldSlots
            .filter((s) => s.userId)
            .map((s) => [
                s.userId,
                { sessionNumber: s.sessionNumber, courtNumber: s.courtNumber }
            ])
    )
    const newByUser = new Map(
        newSlots
            .filter((s) => s.userId)
            .map((s) => [
                s.userId,
                { sessionNumber: s.sessionNumber, courtNumber: s.courtNumber }
            ])
    )

    const changes: RosterChangeEntry[] = []

    for (const [userId, newAssignment] of newByUser) {
        const oldAssignment = oldByUser.get(userId)
        if (!oldAssignment) {
            changes.push({
                userId,
                displayName: playerName(userId),
                changeKind: "added",
                week1Assignment: newAssignment,
                divisionAssignments: null
            })
        } else if (
            oldAssignment.sessionNumber !== newAssignment.sessionNumber ||
            oldAssignment.courtNumber !== newAssignment.courtNumber
        ) {
            changes.push({
                userId,
                displayName: playerName(userId),
                changeKind: "changed",
                week1Assignment: newAssignment,
                divisionAssignments: null
            })
        }
    }

    for (const [userId] of oldByUser) {
        if (!newByUser.has(userId)) {
            changes.push({
                userId,
                displayName: playerName(userId),
                changeKind: "removed",
                week1Assignment: null,
                divisionAssignments: null
            })
        }
    }

    return changes
}

export function EditWeek1RosterForm({
    players,
    slots,
    playerPicUrl,
    seasonLabel,
    updateRosters,
    sendNotifications
}: EditWeek1RosterFormProps) {
    const modal = usePlayerDetailModal()

    const comboboxPlayers = useMemo<ComboboxPlayer[]>(
        () =>
            players.map((player) => ({
                id: player.id,
                firstName: player.firstName,
                lastName: player.lastName,
                preferredName: player.preferredName,
                male: player.male,
                hasPairPick: player.hasPairPick,
                placementScore: player.placementScore,
                seasonsPlayedCount: player.seasonsPlayed
            })),
        [players]
    )

    const initialSlots = useMemo(
        () =>
            slots.map(
                (slot): LocalSlot => ({
                    localKey: `db-${slot.id}`,
                    sessionNumber: slot.sessionNumber,
                    courtNumber: slot.courtNumber,
                    userId: slot.userId
                })
            ),
        [slots]
    )

    const editor = useRosterEditor<LocalSlot>({
        initialSlots,
        validate: (filledSlots) => {
            const userIds = filledSlots.map((s) => s.userId)
            return new Set(userIds).size !== userIds.length
                ? "A player cannot be assigned to multiple slots."
                : null
        },
        save: (filledSlots) =>
            updateRosters(
                filledSlots.map((slot) => ({
                    sessionNumber: slot.sessionNumber,
                    courtNumber: slot.courtNumber,
                    userId: slot.userId
                }))
            ),
        defaultSuccessMessage: "Week 1 rosters saved.",
        computeDiff: (oldSlots, newSlots) =>
            computeWeek1Diff(oldSlots, newSlots, players),
        sendChanges: (toNotify) => {
            const assignments = toNotify
                .filter((c) => c.changeKind !== "removed" && c.week1Assignment)
                .map((c) => ({
                    userId: c.userId,
                    sessionNumber: c.week1Assignment?.sessionNumber ?? 0,
                    courtNumber: c.week1Assignment?.courtNumber ?? 0
                }))
            const removedIds = toNotify
                .filter((c) => c.changeKind === "removed")
                .map((c) => c.userId)
            return sendNotifications(assignments, removedIds, seasonLabel)
        }
    })

    const slotsBySessionCourt = useMemo(() => {
        const map = new Map<string, LocalSlot[]>()
        for (const slot of editor.slotAssignments) {
            const key = `${slot.sessionNumber}-${slot.courtNumber}`
            const list = map.get(key) || []
            list.push(slot)
            map.set(key, list)
        }
        return map
    }, [editor.slotAssignments])

    const excludeIdsFor = (slot: LocalSlot) =>
        editor.filledUserIds.filter((id) => id !== slot.userId)

    const renderCourtGrid = (sessionNumber: number) => (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COURT_NUMBERS.map((courtNumber) => (
                <SlotBox
                    key={`session-${sessionNumber}-court-${courtNumber}`}
                    title={`Court ${courtNumber}`}
                    slots={
                        slotsBySessionCourt.get(
                            `${sessionNumber}-${courtNumber}`
                        ) || []
                    }
                    players={comboboxPlayers}
                    onChangeSlot={editor.changeSlotUser}
                    onRemoveSlot={editor.removeSlot}
                    onAddSlot={() =>
                        editor.addSlot({ sessionNumber, courtNumber })
                    }
                    onOpenDetail={modal.openPlayerDetail}
                    excludeIdsFor={excludeIdsFor}
                />
            ))}
        </div>
    )

    return (
        <div className="space-y-6">
            {[1, 2].map((sessionNumber) => (
                <Card key={`session-${sessionNumber}`}>
                    <CardHeader>
                        <CardTitle>Session {sessionNumber}</CardTitle>
                    </CardHeader>
                    <CardContent>{renderCourtGrid(sessionNumber)}</CardContent>
                </Card>
            ))}

            <Card>
                <CardHeader>
                    <CardTitle>Alternates</CardTitle>
                </CardHeader>
                <CardContent>{renderCourtGrid(ALTERNATE_SESSION)}</CardContent>
            </Card>

            <UnassignedWeek1Players
                players={players}
                assignedUserIds={editor.filledUserIds}
                onPlayerClick={modal.openPlayerDetail}
            />

            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    onClick={editor.handleSubmit}
                    disabled={editor.isSaving}
                >
                    {editor.isSaving ? "Saving..." : "Save Week 1"}
                </Button>
            </div>

            <AdminPlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                signupHistory={modal.signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                emailSuppressions={modal.emailSuppressions}
                emailHistory={modal.emailHistory}
                viewerRating={modal.viewerRating}
            />

            <RosterNotificationDialog
                open={editor.notifyDialog.open}
                weekNumber={1}
                seasonLabel={seasonLabel}
                changes={editor.notifyDialog.changes}
                isSending={editor.notifyDialog.isSending}
                onConfirm={editor.notifyDialog.onConfirm}
                onClose={editor.notifyDialog.onClose}
            />
        </div>
    )
}
