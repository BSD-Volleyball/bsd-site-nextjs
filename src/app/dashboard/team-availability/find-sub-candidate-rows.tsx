"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
    RegularSubCandidate,
    PermanentSubCandidate
} from "./find-sub-actions"
import { formatMatchTime, genderLabel } from "./find-sub-helpers"
import { formatDisplayName } from "@/lib/utils"

export function RegularCandidateRow({
    candidate: c,
    rank,
    nonMaleNeeded,
    canLockIn,
    onOpenDetail,
    onOpenContact,
    onLockIn,
    onRequestSub
}: {
    candidate: RegularSubCandidate
    rank: number
    nonMaleNeeded: boolean
    canLockIn: boolean
    onOpenDetail: (userId: string) => void
    onOpenContact: (userId: string, name: string) => void
    onLockIn: () => void
    onRequestSub: () => void
}) {
    const name = formatDisplayName(c.firstName, c.lastName, c.preferredName)
    return (
        <div className="flex items-start gap-3 rounded-md border p-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-xs">
                {rank}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => onOpenDetail(c.userId)}
                        className="font-medium text-sm hover:underline"
                    >
                        {name}
                        {genderLabel(c.male) ? ` (${genderLabel(c.male)})` : ""}
                    </button>
                    {nonMaleNeeded && c.male !== true && (
                        <Badge variant="secondary" className="text-xs">
                            Non-male
                        </Badge>
                    )}
                    {nonMaleNeeded && c.male === true && (
                        <Badge variant="outline" className="text-xs">
                            Male
                        </Badge>
                    )}
                </div>
                <p className="text-muted-foreground text-sm">
                    {c.teamName}
                    {c.teamNumber != null ? ` (#${c.teamNumber})` : ""} &mdash;{" "}
                    {c.divisionName}
                </p>
                <p className="text-muted-foreground text-sm">
                    Round {c.round}, Pick {c.overall}
                </p>
                {c.matchTime && (
                    <p className="text-muted-foreground text-sm">
                        Their match: {formatMatchTime(c.matchTime)}
                    </p>
                )}
                {c.notes.length > 0 && (
                    <p className="mt-0.5 text-muted-foreground/70 text-sm">
                        {c.notes.map((note, i) => (
                            <span key={note}>
                                {i > 0 && " · "}
                                <span
                                    className={
                                        note === "Adjacent time slot"
                                            ? "font-medium text-green-600 dark:text-green-400"
                                            : undefined
                                    }
                                >
                                    {note}
                                </span>
                            </span>
                        ))}
                    </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                        type="button"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={!canLockIn}
                        title={
                            canLockIn
                                ? "Ask this player's captain to approve the sub"
                                : "Select exactly one missing player to enable"
                        }
                        onClick={onRequestSub}
                    >
                        Request sub
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        disabled={!canLockIn}
                        title={
                            canLockIn
                                ? "Lock in for this match"
                                : "Select exactly one missing player to enable"
                        }
                        onClick={onLockIn}
                    >
                        Lock in for this match
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => onOpenContact(c.userId, name)}
                    >
                        Contact Info
                    </Button>
                </div>
            </div>
        </div>
    )
}

export function PermanentCandidateRow({
    candidate: c,
    rank,
    canLockIn,
    onOpenDetail,
    onOpenContact,
    onLockIn
}: {
    candidate: PermanentSubCandidate
    rank: number
    canLockIn: boolean
    onOpenDetail: (userId: string) => void
    onOpenContact: (userId: string, name: string) => void
    onLockIn: () => void
}) {
    const name = formatDisplayName(c.firstName, c.lastName, c.preferredName)
    return (
        <div className="flex items-start gap-3 rounded-md border p-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-xs">
                {rank}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => onOpenDetail(c.userId)}
                        className="font-medium text-sm hover:underline"
                    >
                        {name}
                        {genderLabel(c.male) ? ` (${genderLabel(c.male)})` : ""}
                    </button>
                </div>
                {c.lastDivisionName ? (
                    <p className="text-muted-foreground text-sm">
                        Last played: {c.lastDivisionName}
                        {c.lastSeasonLabel ? ` (${c.lastSeasonLabel})` : ""}
                    </p>
                ) : (
                    <p className="text-muted-foreground text-sm">
                        No prior season history
                    </p>
                )}
                {c.lastRound != null && (
                    <p className="text-muted-foreground text-sm">
                        Previously drafted: Round {c.lastRound}
                    </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => onOpenContact(c.userId, name)}
                    >
                        Contact Info
                    </Button>
                    {canLockIn && (
                        <Button
                            type="button"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={onLockIn}
                        >
                            Lock in permanent sub
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
