"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CreditCard, PaymentForm } from "react-square-web-payments-sdk"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { WaiverContent } from "@/components/waiver-content"
import { UserCombobox } from "@/components/user-combobox"
import {
    submitTournamentSignup,
    type EligiblePlayer,
    type TournamentSignupFormData
} from "./actions"
import type {
    DivisionAvailability,
    TournamentDivisionConfig
} from "@/lib/tournament-config"

interface Props {
    tournament: {
        id: number
        name: string
        divisions: TournamentDivisionConfig[]
        cost: string
        originalCost: string
    }
    discount: { id: number; percentage: string } | null
    divisionAvailability: DivisionAvailability[]
    currentUserId: string
    // Captain's gender from users.male. Null means unknown (profile incomplete);
    // we still let them proceed but warn — the server will reject if needed.
    currentUserMale: boolean | null
    eligiblePlayers: EligiblePlayer[]
    activeWaiver: { id: number; content: string }
    squareAppId: string
    squareLocationId: string
}

// Resize a "slots" array (each slot is a userId or null) to `target` length,
// preserving any selections that still fit.
function resizeSlots(
    slots: (string | null)[],
    target: number
): (string | null)[] {
    if (slots.length === target) return slots
    if (slots.length > target) return slots.slice(0, target)
    return [...slots, ...Array(target - slots.length).fill(null)]
}

export function TournamentSignupWizard({
    tournament,
    discount,
    divisionAvailability,
    currentUserId,
    currentUserMale,
    eligiblePlayers,
    activeWaiver,
    squareAppId,
    squareLocationId
}: Props) {
    const isFree = parseFloat(tournament.cost) <= 0
    const router = useRouter()
    const { resolvedTheme } = useTheme()
    const [tab, setTab] = useState<"info" | "roster" | "waiver" | "payment">(
        "info"
    )
    const [teamName, setTeamName] = useState("")
    // Lookup for capacity by tournament_divisions.id
    const availabilityById = useMemo(
        () => new Map(divisionAvailability.map((d) => [d.divisionId, d])),
        [divisionAvailability]
    )
    // Default preferred division to the first non-full one.
    const [preferredDivisionId, setPreferredDivisionId] = useState<number>(
        () =>
            tournament.divisions.find((d) => !availabilityById.get(d.id)?.full)
                ?.id ??
            tournament.divisions[0]?.id ??
            0
    )

    // One entry per cap slot. Captain occupies index 0 of their gender bucket
    // (rendered as a fixed row, not a combobox), so the *combobox* count is
    // (cap - 1) for the captain's gender and (cap) for the other gender.
    const [maleSlots, setMaleSlots] = useState<(string | null)[]>([])
    const [nonMaleSlots, setNonMaleSlots] = useState<(string | null)[]>([])
    const [waiverAgreed, setWaiverAgreed] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)

    const preferredDivision = useMemo(
        () =>
            tournament.divisions.find((d) => d.id === preferredDivisionId) ??
            null,
        [tournament.divisions, preferredDivisionId]
    )

    // Reshape slots when the preferred division (and thus its caps) changes.
    // Captain's slot is reserved on their gender side, so we allocate
    // (cap - 1) combobox slots there.
    useEffect(() => {
        if (!preferredDivision) {
            setMaleSlots([])
            setNonMaleSlots([])
            return
        }
        const maleCount =
            currentUserMale === true
                ? Math.max(0, preferredDivision.malePerTeam - 1)
                : preferredDivision.malePerTeam
        const nonMaleCount =
            currentUserMale === false
                ? Math.max(0, preferredDivision.nonMalePerTeam - 1)
                : preferredDivision.nonMalePerTeam
        setMaleSlots((prev) => resizeSlots(prev, maleCount))
        setNonMaleSlots((prev) => resizeSlots(prev, nonMaleCount))
    }, [preferredDivision, currentUserMale])

    // Pools of eligible players for each gender, excluding the captain since
    // they're not pickable (reserved slot).
    const malePool = useMemo(
        () =>
            eligiblePlayers
                .filter((p) => p.male === true && p.id !== currentUserId)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => ({ id: p.id, name: p.name })),
        [eligiblePlayers, currentUserId]
    )
    const nonMalePool = useMemo(
        () =>
            eligiblePlayers
                .filter((p) => p.male === false && p.id !== currentUserId)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => ({ id: p.id, name: p.name })),
        [eligiblePlayers, currentUserId]
    )

    function setSlot(
        which: "male" | "nonMale",
        index: number,
        userId: string | null
    ) {
        const updater = which === "male" ? setMaleSlots : setNonMaleSlots
        updater((prev) => prev.map((s, i) => (i === index ? userId : s)))
    }

    // Flat list of picked IDs (captain excluded — server adds them).
    function pickedIds(): string[] {
        const ids: string[] = []
        for (const s of maleSlots) if (s) ids.push(s)
        for (const s of nonMaleSlots) if (s) ids.push(s)
        return ids
    }

    const preferredFull =
        availabilityById.get(preferredDivisionId)?.full ?? false
    const infoComplete =
        teamName.trim().length > 0 && preferredDivisionId > 0 && !preferredFull
    const canProceedToPayment = infoComplete && waiverAgreed

    return (
        <Card>
            <CardHeader>
                <CardTitle>{tournament.name} Signup</CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v as typeof tab)}
                >
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="info">Info</TabsTrigger>
                        <TabsTrigger value="roster" disabled={!infoComplete}>
                            Roster
                        </TabsTrigger>
                        <TabsTrigger value="waiver" disabled={!infoComplete}>
                            Waiver
                        </TabsTrigger>
                        <TabsTrigger
                            value="payment"
                            disabled={!canProceedToPayment}
                        >
                            Payment
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="info" className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="team-name">Team Name</Label>
                            <Input
                                id="team-name"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pref-div">Preferred Division</Label>
                            <select
                                id="pref-div"
                                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                value={preferredDivisionId}
                                onChange={(e) =>
                                    setPreferredDivisionId(
                                        Number(e.target.value)
                                    )
                                }
                            >
                                {tournament.divisions.map((d) => {
                                    const a = availabilityById.get(d.id)
                                    const full = a?.full ?? false
                                    return (
                                        <option
                                            key={d.id}
                                            value={d.id}
                                            disabled={full}
                                        >
                                            {d.divisionName} — up to{" "}
                                            {d.malePerTeam}M /{" "}
                                            {d.nonMalePerTeam}NM
                                            {a &&
                                                ` (${a.teamCount}/${a.maxTeams} teams${full ? " — full" : ""})`}
                                        </option>
                                    )
                                })}
                            </select>
                        </div>
                        <div className="flex justify-end">
                            <Button
                                onClick={() => setTab("roster")}
                                disabled={!infoComplete}
                            >
                                Next: Roster
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="roster" className="space-y-6 pt-4">
                        {preferredDivision && (
                            <p className="text-muted-foreground text-sm">
                                You can roster up to{" "}
                                <strong>{preferredDivision.malePerTeam}</strong>{" "}
                                males and{" "}
                                <strong>
                                    {preferredDivision.nonMalePerTeam}
                                </strong>{" "}
                                non-males. You are auto-included on your gender
                                side. You can add or remove players up until the
                                roster lock date.
                            </p>
                        )}

                        <RosterSection
                            title="Males"
                            slots={maleSlots}
                            pool={malePool}
                            otherGenderPickedIds={nonMaleSlots.filter(
                                (s): s is string => s !== null
                            )}
                            captainReserved={currentUserMale === true}
                            onSlotChange={(i, id) => setSlot("male", i, id)}
                        />

                        <RosterSection
                            title="Non-Males"
                            slots={nonMaleSlots}
                            pool={nonMalePool}
                            otherGenderPickedIds={maleSlots.filter(
                                (s): s is string => s !== null
                            )}
                            captainReserved={currentUserMale === false}
                            onSlotChange={(i, id) => setSlot("nonMale", i, id)}
                        />

                        {currentUserMale === null && (
                            <p className="text-amber-600 text-sm">
                                Your profile doesn't have a gender set, so we
                                couldn't reserve a slot for you on either side.
                                Update your Volleyball Profile, then reload this
                                page.
                            </p>
                        )}

                        <div className="flex justify-end">
                            <Button onClick={() => setTab("waiver")}>
                                Next: Waiver
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="waiver" className="space-y-4 pt-4">
                        <WaiverContent content={activeWaiver.content} />
                        <div className="flex items-start gap-2">
                            <Checkbox
                                id="waiver"
                                checked={waiverAgreed}
                                onCheckedChange={(c) =>
                                    setWaiverAgreed(c === true)
                                }
                            />
                            <Label
                                htmlFor="waiver"
                                className="font-normal text-sm"
                            >
                                I have read and agree to the waiver on behalf of
                                myself as captain.
                            </Label>
                        </div>
                        <div className="flex justify-end">
                            <Button
                                onClick={() => setTab("payment")}
                                disabled={!waiverAgreed}
                            >
                                Next: Payment
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="payment" className="space-y-4 pt-4">
                        {discount ? (
                            <div className="space-y-1 text-sm">
                                <p>
                                    Team fee:{" "}
                                    <span className="text-muted-foreground line-through">
                                        ${tournament.originalCost}
                                    </span>{" "}
                                    <strong>${tournament.cost}</strong>
                                </p>
                                <p className="text-green-700 text-xs dark:text-green-400">
                                    {discount.percentage}% tournament discount
                                    applied.
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm">
                                Team fee: <strong>${tournament.cost}</strong>
                            </p>
                        )}
                        {isFree ? (
                            <Button
                                disabled={isProcessing}
                                onClick={async () => {
                                    setIsProcessing(true)
                                    try {
                                        const payload: TournamentSignupFormData =
                                            {
                                                teamName: teamName.trim(),
                                                preferredDivisionId,
                                                rosterUserIds: pickedIds()
                                            }
                                        const result =
                                            await submitTournamentSignup(
                                                null,
                                                payload,
                                                activeWaiver.id,
                                                discount?.id
                                            )
                                        if (result.status) {
                                            toast.success(
                                                "Registered! Your team is signed up."
                                            )
                                            router.push(
                                                "/dashboard/tournament-team"
                                            )
                                            router.refresh()
                                        } else {
                                            toast.error(result.message)
                                        }
                                    } finally {
                                        setIsProcessing(false)
                                    }
                                }}
                            >
                                {isProcessing
                                    ? "Registering..."
                                    : "Complete Free Registration"}
                            </Button>
                        ) : resolvedTheme == null ? null : (
                            <PaymentForm
                                key={resolvedTheme}
                                applicationId={squareAppId}
                                locationId={squareLocationId}
                                cardTokenizeResponseReceived={async (
                                    tokenResult
                                ) => {
                                    if (tokenResult.status !== "OK") {
                                        toast.error(
                                            "Failed to process card. Please try again."
                                        )
                                        return
                                    }
                                    setIsProcessing(true)
                                    try {
                                        const payload: TournamentSignupFormData =
                                            {
                                                teamName: teamName.trim(),
                                                preferredDivisionId,
                                                rosterUserIds: pickedIds()
                                            }
                                        const result =
                                            await submitTournamentSignup(
                                                tokenResult.token!,
                                                payload,
                                                activeWaiver.id,
                                                discount?.id
                                            )
                                        if (result.status) {
                                            toast.success(
                                                "Registered! Your team is signed up."
                                            )
                                            router.push(
                                                "/dashboard/tournament-team"
                                            )
                                            router.refresh()
                                        } else {
                                            toast.error(result.message)
                                        }
                                    } finally {
                                        setIsProcessing(false)
                                    }
                                }}
                                createPaymentRequest={() => ({
                                    countryCode: "US",
                                    currencyCode: "USD",
                                    total: {
                                        amount: tournament.cost,
                                        label: "Tournament Team Fee"
                                    }
                                })}
                            >
                                <CreditCard
                                    buttonProps={{
                                        isLoading: isProcessing
                                    }}
                                />
                            </PaymentForm>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter />
        </Card>
    )
}

interface RosterSectionProps {
    title: string
    slots: (string | null)[]
    pool: { id: string; name: string }[]
    // IDs already picked on the *other* gender side — excluded so a player
    // somehow eligible for both can't appear twice across sections.
    otherGenderPickedIds: string[]
    captainReserved: boolean
    onSlotChange: (index: number, userId: string | null) => void
}

function RosterSection({
    title,
    slots,
    pool,
    otherGenderPickedIds,
    captainReserved,
    onSlotChange
}: RosterSectionProps) {
    const usedInSection = new Set(slots.filter((s): s is string => s !== null))
    const usedOther = new Set(otherGenderPickedIds)

    return (
        <div className="space-y-2 rounded-md border p-4">
            <h4 className="font-medium">{title}</h4>
            <div className="space-y-2">
                {captainReserved && (
                    <div className="flex items-center justify-between rounded-md border bg-muted px-3 py-2 text-sm">
                        <span>You (captain)</span>
                        <span className="text-muted-foreground text-xs">
                            reserved
                        </span>
                    </div>
                )}
                {slots.length === 0 && !captainReserved && (
                    <p className="text-muted-foreground text-sm">
                        No {title.toLowerCase()} slots in the selected division.
                    </p>
                )}
                {slots.map((selected, i) => {
                    // Each combobox sees: the full pool, minus players picked
                    // in any other slot of this section or in the other
                    // gender section. The currently-picked player for *this*
                    // slot is kept so the row shows the current selection.
                    const visible = pool.filter(
                        (p) =>
                            p.id === selected ||
                            (!usedInSection.has(p.id) && !usedOther.has(p.id))
                    )
                    return (
                        <UserCombobox
                            key={i}
                            users={visible}
                            value={selected}
                            onChange={(id) => onSlotChange(i, id)}
                            placeholder={`Pick ${title
                                .toLowerCase()
                                .replace(/s$/, "")} player ${
                                captainReserved ? i + 2 : i + 1
                            }`}
                        />
                    )
                })}
            </div>
        </div>
    )
}
