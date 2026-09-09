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
import type { PermanentSubCandidate, SubPoolOption } from "./find-sub-actions"
import type { RosterPlayer } from "./actions"
import {
    PermanentCandidateRow,
    SubSourceBadge
} from "./find-sub-candidate-rows"
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
    canSeeFullPool: boolean
    poolOptions: SubPoolOption[] | null
    otherPoolUserId: string
    onOtherPoolChange: (userId: string) => void
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
    canSeeFullPool,
    poolOptions,
    otherPoolUserId,
    onOtherPoolChange,
    onOpenDetail,
    onOpenContact,
    onOpenLock
}: PermanentSubCardProps) {
    function lookupPoolOption(userId: string): SubPoolOption | null {
        return poolOptions?.find((o) => o.userId === userId) ?? null
    }

    const otherPoolOption = otherPoolUserId
        ? lookupPoolOption(otherPoolUserId)
        : null

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">
                    Find a Permanent Sub
                </CardTitle>
                <CardDescription>
                    When a rostered player can no longer play the season,
                    suggests replacements of the same gender who most recently
                    played in the same division — drawn from the waitlist and
                    from players who signed up but were never drafted.
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
                        Searching waitlist and undrafted signups…
                    </p>
                )}

                {error && <p className="text-destructive text-sm">{error}</p>}

                {!isPending && result && (
                    <div className="space-y-3">
                        {result.candidates.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No waitlisted or undrafted players found
                                matching the gender of{" "}
                                {result.replacedPlayerName}.
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

                        {/* "Other" full-pool dropdown — elevated viewers only */}
                        {canSeeFullPool && (
                            <div className="rounded-md border border-dashed p-3">
                                <p className="mb-2 font-medium text-sm">
                                    Other (full pool)
                                </p>
                                <p className="mb-2 text-muted-foreground text-sm">
                                    Pick anyone on the waitlist or signed up but
                                    undrafted, regardless of gender or division.
                                    Visible to admins and division commissioners
                                    only.
                                </p>
                                <Select
                                    value={otherPoolUserId}
                                    onValueChange={(v) => onOtherPoolChange(v)}
                                    disabled={!poolOptions}
                                >
                                    <SelectTrigger>
                                        <SelectValue
                                            placeholder={
                                                poolOptions
                                                    ? "Select a replacement…"
                                                    : "Loading players…"
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {poolOptions?.map((o) => {
                                            const name = formatDisplayName(
                                                o.firstName,
                                                o.lastName,
                                                o.preferredName
                                            )
                                            const sub = o.lastDivisionName
                                                ? `${o.lastDivisionName}${o.lastSeasonLabel ? ` (${o.lastSeasonLabel})` : ""}`
                                                : "No prior history"
                                            const src =
                                                o.source === "waitlist"
                                                    ? "Waitlist"
                                                    : "Undrafted"
                                            return (
                                                <SelectItem
                                                    key={o.userId}
                                                    value={o.userId}
                                                >
                                                    {name} — {sub} [{src}]
                                                </SelectItem>
                                            )
                                        })}
                                    </SelectContent>
                                </Select>
                                {otherPoolOption && (
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <SubSourceBadge
                                            source={otherPoolOption.source}
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={
                                                !canLockInPermanent ||
                                                !selectedPlayerId
                                            }
                                            onClick={() =>
                                                onOpenLock({
                                                    userId: otherPoolOption.userId,
                                                    name: formatDisplayName(
                                                        otherPoolOption.firstName,
                                                        otherPoolOption.lastName,
                                                        otherPoolOption.preferredName
                                                    )
                                                })
                                            }
                                        >
                                            Lock in permanent sub
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
