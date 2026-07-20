"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { UserCombobox } from "@/components/user-combobox"
import { updateSignupPreferences } from "./actions"
import type { SignupPreferences } from "./utils"

const CAPTAIN_LABELS: Record<string, string> = {
    yes: "Yes",
    only_if_needed: "Only if Needed",
    no: "No"
}

interface CaptainPairingFormProps {
    signupId: number
    users: { id: string; name: string }[]
    initial: SignupPreferences
    canEdit: boolean
}

export function CaptainPairingForm({
    signupId,
    users,
    initial,
    canEdit
}: CaptainPairingFormProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)

    const [captain, setCaptain] = useState(initial.captain || "no")
    const [pair, setPair] = useState(initial.pair)
    const [pairPick, setPairPick] = useState<string | null>(initial.pairPick)
    const [pairReason, setPairReason] = useState(initial.pairReason ?? "")

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)

        const result = await updateSignupPreferences(signupId, {
            captain,
            pair,
            pairPick,
            pairReason
        })

        if (result.status) {
            toast.success(result.message)
            router.refresh()
        } else {
            toast.error(result.message)
        }
        setIsLoading(false)
    }

    if (!canEdit) {
        const pairName = users.find((u) => u.id === pairPick)?.name
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Captain & Pairing Preferences</CardTitle>
                    <CardDescription>
                        These choices can no longer be edited now that drafting
                        has started.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">
                            Captain Interest:
                        </span>
                        <span className="font-medium">
                            {CAPTAIN_LABELS[captain] ?? "No"}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">
                            Pair Request:
                        </span>
                        <span className="font-medium">
                            {pair && pairName ? pairName : "None"}
                        </span>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <form onSubmit={handleSubmit}>
            <Card>
                <CardHeader>
                    <CardTitle>Captain & Pairing Preferences</CardTitle>
                    <CardDescription>
                        Update whether you&apos;re interested in captaining and
                        who you&apos;d like to pair with for the season.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-3">
                        <Label>Interested in being a Captain?</Label>
                        <RadioGroup
                            value={captain}
                            onValueChange={setCaptain}
                            className="flex flex-col gap-2"
                        >
                            <div className="flex items-center gap-2">
                                <RadioGroupItem value="yes" id="captain-yes" />
                                <Label
                                    htmlFor="captain-yes"
                                    className="cursor-pointer font-normal"
                                >
                                    Yes
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <RadioGroupItem
                                    value="only_if_needed"
                                    id="captain-only"
                                />
                                <Label
                                    htmlFor="captain-only"
                                    className="cursor-pointer font-normal"
                                >
                                    Only if Needed
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <RadioGroupItem value="no" id="captain-no" />
                                <Label
                                    htmlFor="captain-no"
                                    className="cursor-pointer font-normal"
                                >
                                    No
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <div className="space-y-4 border-t pt-6">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            <p>
                                As a draft leauge we strongly discourage
                                requests to pair with another player and will
                                only accept them under very limited
                                circumstances (significant other, direct
                                relative, and in rare circumstances carpooling).
                                If requesting to pair, specify with whom to pair
                                and the reason for pairing. If you can not find
                                your pair below, have them register on the site
                                before either of you sign up for the season.
                            </p>
                        </div>

                        <div className="flex items-center justify-between">
                            <Label
                                htmlFor="pair-toggle"
                                className="cursor-pointer"
                            >
                                Request to pair for the season:
                            </Label>
                            <Switch
                                id="pair-toggle"
                                checked={pair}
                                onCheckedChange={(checked: boolean) => {
                                    setPair(checked)
                                    if (!checked) {
                                        setPairPick(null)
                                        setPairReason("")
                                    }
                                }}
                            />
                        </div>

                        {pair && (
                            <>
                                <div className="space-y-2">
                                    <Label>Pair</Label>
                                    <UserCombobox
                                        users={users}
                                        value={pairPick}
                                        onChange={setPairPick}
                                        placeholder="Select a player to pair with..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="pair-reason">
                                        Reason for pairing
                                    </Label>
                                    <Textarea
                                        id="pair-reason"
                                        value={pairReason}
                                        onChange={(e) =>
                                            setPairReason(e.target.value)
                                        }
                                        placeholder="Why would you like to be paired with this player?"
                                        rows={3}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </CardContent>
                <CardFooter className="border-t pt-6">
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? "Saving..." : "Save Changes"}
                    </Button>
                </CardFooter>
            </Card>
        </form>
    )
}
