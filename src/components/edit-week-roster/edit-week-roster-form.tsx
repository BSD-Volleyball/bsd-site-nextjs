"use client"
import { formatTryoutTeamLabel } from "@/lib/tryout-team-names"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { formatDisplayName } from "@/lib/utils"
import { findSameTimeConflicts } from "@/lib/preseason/slots"

import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import {
    RosterNotificationDialog,
    type RosterChangeEntry
} from "@/components/roster-notification"
import { SlotBox } from "./slot-box"
import { useRosterEditor } from "./use-roster-editor"

export interface EditWeekPlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    hasPairPick: boolean
    placementScore: number
    ratingScore: number | null
    lastDivisionName: string | null
    seasonsPlayedCount: number
    /**
     * Set when the player holds a roster slot but is no longer eligible for
     * it (opted out of the tryout night, or signup removed). Rendered in red;
     * never offered as a choice for other slots.
     */
    unavailableReason: string | null
}

export interface EditWeekSlot {
    id: number
    divisionId: number
    divisionName: string
    teamNumber: number
    userId: string
    isCaptain: boolean
}

export interface EditWeekRosterEntry {
    divisionId: number
    teamNumber: number
    userId: string
    isCaptain: boolean
}

export interface EditWeekAssignment {
    userId: string
    divisionId: number
    divisionName: string
    teamNumber: number
}

interface EditWeekRosterFormProps {
    weekNumber: 2 | 3
    /**
     * "locked": captain slots are fixed (week 2 — captains come from teams).
     * "editable": any filled slot can be toggled as captain (week 3).
     */
    captainMode: "locked" | "editable"
    players: EditWeekPlayer[]
    slots: EditWeekSlot[]
    playerPicUrl: string
    seasonLabel: string
    updateRosters: (
        entries: EditWeekRosterEntry[]
    ) => Promise<{ status: boolean; message?: string }>
    sendNotifications: (
        assignments: EditWeekAssignment[],
        removedUserIds: string[],
        seasonLabel: string
    ) => Promise<unknown>
}

interface LocalSlot {
    localKey: string
    divisionId: number
    divisionName: string
    teamNumber: number
    userId: string
    isCaptain: boolean
}

function computeRosterDiff(
    oldSlots: LocalSlot[],
    newSlots: LocalSlot[],
    players: EditWeekPlayer[]
): RosterChangeEntry[] {
    const playerName = (userId: string) => {
        const p = players.find((pl) => pl.id === userId)
        if (!p) return userId
        return formatDisplayName(p.firstName, p.lastName, p.preferredName)
    }

    type DivEntry = {
        divisionId: number
        divisionName: string
        teamNumber: number
    }
    const buildUserMap = (slots: LocalSlot[]) => {
        const m = new Map<string, DivEntry[]>()
        for (const s of slots) {
            if (!s.userId) continue
            const list = m.get(s.userId) || []
            list.push({
                divisionId: s.divisionId,
                divisionName: s.divisionName,
                teamNumber: s.teamNumber
            })
            m.set(s.userId, list)
        }
        return m
    }
    const serialize = (entries: DivEntry[]) =>
        entries
            .map((e) => `${e.divisionId}-${e.teamNumber}`)
            .sort()
            .join(",")

    const oldByUser = buildUserMap(oldSlots)
    const newByUser = buildUserMap(newSlots)
    const changes: RosterChangeEntry[] = []

    for (const [userId, newEntries] of newByUser) {
        const oldEntries = oldByUser.get(userId)
        if (!oldEntries) {
            changes.push({
                userId,
                displayName: playerName(userId),
                changeKind: "added",
                week1Assignment: null,
                divisionAssignments: newEntries.map((e) => ({
                    divisionId: e.divisionId,
                    divisionName: e.divisionName,
                    teamNumber: e.teamNumber
                }))
            })
        } else if (serialize(oldEntries) !== serialize(newEntries)) {
            changes.push({
                userId,
                displayName: playerName(userId),
                changeKind: "changed",
                week1Assignment: null,
                divisionAssignments: newEntries.map((e) => ({
                    divisionId: e.divisionId,
                    divisionName: e.divisionName,
                    teamNumber: e.teamNumber
                }))
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

export function EditWeekRosterForm({
    weekNumber,
    captainMode,
    players,
    slots,
    playerPicUrl,
    seasonLabel,
    updateRosters,
    sendNotifications
}: EditWeekRosterFormProps) {
    const modal = usePlayerDetailModal()

    const initialSlots = useMemo(
        () =>
            slots.map(
                (slot): LocalSlot => ({
                    localKey: `db-${slot.id}`,
                    divisionId: slot.divisionId,
                    divisionName: slot.divisionName,
                    teamNumber: slot.teamNumber,
                    userId: slot.userId,
                    isCaptain: slot.isCaptain
                })
            ),
        [slots]
    )

    const editor = useRosterEditor<LocalSlot>({
        initialSlots,
        save: (filledSlots) =>
            updateRosters(
                filledSlots.map((slot) => ({
                    divisionId: slot.divisionId,
                    teamNumber: slot.teamNumber,
                    userId: slot.userId,
                    isCaptain: slot.isCaptain
                }))
            ),
        defaultSuccessMessage: `Week ${weekNumber} rosters saved.`,
        computeDiff: (oldSlots, newSlots) =>
            computeRosterDiff(oldSlots, newSlots, players),
        sendChanges: (toNotify) => {
            const assignments = toNotify
                .filter(
                    (c) => c.changeKind !== "removed" && c.divisionAssignments
                )
                .flatMap((c) =>
                    (c.divisionAssignments || []).map((a) => ({
                        userId: c.userId,
                        divisionId: a.divisionId,
                        divisionName: a.divisionName,
                        teamNumber: a.teamNumber
                    }))
                )
            const removedIds = toNotify
                .filter((c) => c.changeKind === "removed")
                .map((c) => c.userId)
            return sendNotifications(assignments, removedIds, seasonLabel)
        }
    })

    // userId -> number of slots held, for players holding more than one.
    const multiSlotCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const slot of editor.slotAssignments) {
            if (slot.userId) {
                counts.set(slot.userId, (counts.get(slot.userId) || 0) + 1)
            }
        }
        return new Map([...counts.entries()].filter(([, n]) => n > 1))
    }, [editor.slotAssignments])

    // userId -> time slots where the player holds more than one team (all
    // teams in a slot play at once, so this is a double booking).
    const sameTimeConflicts = useMemo(
        () => findSameTimeConflicts(editor.slotAssignments),
        [editor.slotAssignments]
    )

    const groupedSlots = useMemo(() => {
        const divisionMap = new Map<
            number,
            {
                divisionName: string
                teams: Map<number, LocalSlot[]>
            }
        >()

        for (const slot of editor.slotAssignments) {
            const current = divisionMap.get(slot.divisionId) || {
                divisionName: slot.divisionName,
                teams: new Map<number, LocalSlot[]>()
            }

            const teamSlots = current.teams.get(slot.teamNumber) || []
            teamSlots.push(slot)
            current.teams.set(slot.teamNumber, teamSlots)
            divisionMap.set(slot.divisionId, current)
        }

        return [...divisionMap.entries()].sort((a, b) => a[0] - b[0])
    }, [editor.slotAssignments])

    return (
        <div className="space-y-6">
            {groupedSlots.map(([divisionId, divisionData]) => (
                <Card key={`division-${divisionId}`}>
                    <CardHeader>
                        <CardTitle>{divisionData.divisionName}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {Array.from(divisionData.teams.entries()).map(
                                ([teamNumber, teamSlots]) => (
                                    <SlotBox
                                        key={`division-${divisionId}-team-${teamNumber}`}
                                        title={`Team ${formatTryoutTeamLabel(divisionData.divisionName, teamNumber)}`}
                                        slots={teamSlots}
                                        players={players}
                                        onChangeSlot={editor.changeSlotUser}
                                        onRemoveSlot={editor.removeSlot}
                                        onAddSlot={() =>
                                            editor.addSlot({
                                                divisionId,
                                                divisionName:
                                                    divisionData.divisionName,
                                                teamNumber,
                                                isCaptain: false
                                            })
                                        }
                                        onOpenDetail={modal.openPlayerDetail}
                                        comboboxDisabled={(slot) =>
                                            captainMode === "locked" &&
                                            slot.isCaptain
                                        }
                                        slotLabelExtras={(slot) =>
                                            captainMode === "locked" &&
                                            slot.isCaptain ? (
                                                <span className="ml-2 font-semibold text-primary">
                                                    Captain slot
                                                </span>
                                            ) : null
                                        }
                                        belowCombobox={(slot) => (
                                            <>
                                                {slot.userId &&
                                                    multiSlotCounts.has(
                                                        slot.userId
                                                    ) && (
                                                        <p className="text-amber-600 text-sm dark:text-amber-400">
                                                            {multiSlotCounts.get(
                                                                slot.userId
                                                            ) === 2
                                                                ? "Playing twice"
                                                                : `Playing ${multiSlotCounts.get(slot.userId)} times`}
                                                        </p>
                                                    )}
                                                {slot.userId &&
                                                    sameTimeConflicts
                                                        .get(slot.userId)
                                                        ?.filter((c) =>
                                                            c.teams.some(
                                                                (t) =>
                                                                    t.divisionName ===
                                                                        slot.divisionName &&
                                                                    t.teamNumber ===
                                                                        slot.teamNumber
                                                            )
                                                        )
                                                        .map((c) => (
                                                            <p
                                                                key={`conflict-${c.slot}`}
                                                                className="font-semibold text-red-600 text-sm dark:text-red-500"
                                                            >
                                                                Double booked
                                                                (same time):{" "}
                                                                {c.teams
                                                                    .filter(
                                                                        (t) =>
                                                                            t.divisionName !==
                                                                                slot.divisionName ||
                                                                            t.teamNumber !==
                                                                                slot.teamNumber
                                                                    )
                                                                    .map(
                                                                        (t) =>
                                                                            `${t.divisionName} Team ${formatTryoutTeamLabel(t.divisionName, t.teamNumber)}`
                                                                    )
                                                                    .join(", ")}
                                                            </p>
                                                        ))}
                                                {captainMode === "editable" &&
                                                    slot.userId && (
                                                        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                                                            <Checkbox
                                                                checked={
                                                                    slot.isCaptain
                                                                }
                                                                onCheckedChange={() =>
                                                                    editor.updateSlot(
                                                                        slot.localKey,
                                                                        {
                                                                            isCaptain:
                                                                                !slot.isCaptain
                                                                        }
                                                                    )
                                                                }
                                                            />
                                                            Captain
                                                        </label>
                                                    )}
                                            </>
                                        )}
                                    />
                                )
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}

            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    onClick={editor.handleSubmit}
                    disabled={editor.isSaving}
                >
                    {editor.isSaving ? "Saving..." : `Save Week ${weekNumber}`}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={editor.handleNotifyAll}
                    disabled={editor.isSaving}
                >
                    Email All Saved Assignments
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
                weekNumber={weekNumber}
                seasonLabel={seasonLabel}
                changes={editor.notifyDialog.changes}
                isSending={editor.notifyDialog.isSending}
                onConfirm={editor.notifyDialog.onConfirm}
                onClose={editor.notifyDialog.onClose}
            />
        </div>
    )
}
