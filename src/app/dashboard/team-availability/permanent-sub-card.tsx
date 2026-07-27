"use client"

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import type { PermanentSubCandidate, WaitlistOption } from "./find-sub-actions"
import type { RosterPlayer } from "./actions"
import { PermanentCandidateRow } from "./find-sub-candidate-rows"
import { displayName } from "./find-sub-helpers"
import { formatDisplayName } from "@/lib/utils"

type PermanentSubCardProps = {
    activeRoster: RosterPlayer[]
    selectedPlayerId: string
    onPlayerChange: (userId: string) => void
    isPending: boolean
    error: string | null
    result: {
        candidates: PermanentSubCandidate[]
        replacedPlayerName: string
    } | null
    canLockInPermanent: boolean
    canSeeFullWaitlist: boolean
    waitlistOptions: WaitlistOption[] | null
    otherWaitlistUserId: string
    onOtherWaitlistChange: (userId: string) => void
    onOpenDetail: (userId: string) => void
    onOpenContact: (userId: string, name: string) => void
    onOpenLock: (args: { userId: string; name: string }) => void
}

export function PermanentSubCard({
    activeRoster,
    selectedPlayerId,
    onPlayerChange,
    isPending,
    error,
    result,
    canLockInPermanent,
    canSeeFullWaitlist,
    waitlistOptions,
    otherWaitlistUserId,
    onOtherWaitlistChange,
    onOpenDetail,
    onOpenContact,
    onOpenLock
}: PermanentSubCardProps) {
    function lookupWaitlistOption(userId: string): WaitlistOption | null {
        return waitlistOptions?.find((o) => o.userId === userId) ?? null
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">
                    Find a Permanent Sub
                </CardTitle>
                <CardDescription>
                    Suggests waitlisted players of the same gender who most
                    recently played in the same division when a rostered player
                    can no longer play the season.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Select
                    value={selectedPlayerId}
                    onValueChange={onPlayerChange}
                    disabled={isPending}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select player to replace…" />
                    </SelectTrigger>
                    <SelectContent>
                        {activeRoster.map((p) => (
                            <SelectItem key={p.userId} value={p.userId}>
                                {displayName(p)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {isPending && (
                    <p className="text-muted-foreground text-sm">
                        Searching waitlist…
                    </p>
                )}

                {error && <p className="text-destructive text-sm">{error}</p>}

                {!isPending && result && (
                    <div className="space-y-3">
                        {result.candidates.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No waitlisted players found matching the gender
                                of {result.replacedPlayerName}.
                            </p>
                        ) : (
                            result.candidates.map((c, i) => (
                                <PermanentCandidateRow
                                    key={c.userId}
                                    candidate={c}
                                    rank={i + 1}
                                    canLockIn={canLockInPermanent}
                                    onOpenDetail={onOpenDetail}
                                    onOpenContact={onOpenContact}
                                    onLockIn={() =>
                                        onOpenLock({
                                            userId: c.userId,
                                            name: formatDisplayName(
                                                c.firstName,
                                                c.lastName,
                                                c.preferredName
                                            )
                                        })
                                    }
                                />
                            ))
                        )}

                        {/* "Other" full-waitlist dropdown — elevated viewers only */}
                        {canSeeFullWaitlist && (
                            <div className="rounded-md border border-dashed p-3">
                                <p className="mb-2 font-medium text-sm">
                                    Other (full waitlist)
                                </p>
                                <p className="mb-2 text-muted-foreground text-xs">
                                    Pick any waitlisted player, regardless of
                                    gender or division. Visible to admins and
                                    division commissioners only.
                                </p>
                                <Select
                                    value={otherWaitlistUserId}
                                    onValueChange={(v) =>
                                        onOtherWaitlistChange(v)
                                    }
                                    disabled={!waitlistOptions}
                                >
                                    <SelectTrigger>
                                        <SelectValue
                                            placeholder={
                                                waitlistOptions
                                                    ? "Select from waitlist…"
                                                    : "Loading waitlist…"
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {waitlistOptions?.map((o) => {
                                            const name = formatDisplayName(
                                                o.firstName,
                                                o.lastName,
                                                o.preferredName
                                            )
                                            const sub = o.lastDivisionName
                                                ? `${o.lastDivisionName}${o.lastSeasonLabel ? ` (${o.lastSeasonLabel})` : ""}`
                                                : "No prior history"
                                            return (
                                                <SelectItem
                                                    key={o.userId}
                                                    value={o.userId}
                                                >
                                                    {name} — {sub}
                                                </SelectItem>
                                            )
                                        })}
                                    </SelectContent>
                                </Select>
                                {otherWaitlistUserId && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="mt-2"
                                        disabled={
                                            !canLockInPermanent ||
                                            !selectedPlayerId
                                        }
                                        onClick={() => {
                                            const opt =
                                                lookupWaitlistOption(
                                                    otherWaitlistUserId
                                                )
                                            if (!opt) return
                                            onOpenLock({
                                                userId: opt.userId,
                                                name: formatDisplayName(
                                                    opt.firstName,
                                                    opt.lastName,
                                                    opt.preferredName
                                                )
                                            })
                                        }}
                                    >
                                        Lock in permanent sub
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
