"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { CreditCard, PaymentForm } from "react-square-web-payments-sdk"
import {
    submitSeasonPayment,
    submitFreeSignup,
    type PaymentResult,
    type SignupFormData
} from "./actions"
import { UserCombobox } from "./user-combobox"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
    RiCheckLine,
    RiErrorWarningLine,
    RiArrowRightLine
} from "@remixicon/react"
import type { SeasonConfig } from "@/lib/site-config"
import Link from "next/link"

interface User {
    id: string
    name: string
}

interface WizardFormProps {
    amount: string
    users: User[]
    config: SeasonConfig
    discount: { id: number; percentage: string } | null
}

const TABS = ["info", "pairing", "schedule", "waivers", "payment"] as const
type TabValue = (typeof TABS)[number]

export function WizardForm({
    amount,
    users,
    config,
    discount
}: WizardFormProps) {
    const router = useRouter()
    const { resolvedTheme } = useTheme()
    const _isDark = resolvedTheme === "dark"
    const [activeTab, setActiveTab] = useState<TabValue>("info")
    const [formData, setFormData] = useState<SignupFormData>({
        age: "20+",
        captain: "no",
        pair: false,
        pairPick: null,
        pairReason: "",
        datesMissing: "",
        play1stWeek: false
    })
    const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
    const [waiverAgreed, setWaiverAgreed] = useState(false)

    const toggleDate = (date: string) => {
        setSelectedDates((prev) => {
            const newSet = new Set(prev)
            if (newSet.has(date)) {
                newSet.delete(date)
            } else {
                newSet.add(date)
            }
            // Update formData with comma-separated list
            setFormData((f) => ({
                ...f,
                datesMissing: Array.from(newSet).join(", ")
            }))
            return newSet
        })
    }

    const tryoutDates = [
        { key: "tryout1", label: config.tryout1Date },
        { key: "tryout2", label: config.tryout2Date },
        { key: "tryout3", label: config.tryout3Date }
    ].filter((d) => d.label)

    const seasonDates = [
        { key: "season1", label: config.season1Date },
        { key: "season2", label: config.season2Date },
        { key: "season3", label: config.season3Date },
        { key: "season4", label: config.season4Date },
        { key: "season5", label: config.season5Date },
        { key: "season6", label: config.season6Date }
    ].filter((d) => d.label)

    const playoffDates = [
        { key: "playoff1", label: config.playoff1Date },
        { key: "playoff2", label: config.playoff2Date },
        { key: "playoff3", label: config.playoff3Date }
    ].filter((d) => d.label)
    const [isProcessing, setIsProcessing] = useState(false)
    const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(
        null
    )

    // Refresh the page data when payment succeeds to update sidebar
    useEffect(() => {
        if (paymentResult?.success) {
            router.refresh()
        }
    }, [paymentResult?.success, router])

    const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID!
    const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID!

    // Calculate discounted amount
    const discountPercentage = discount ? parseFloat(discount.percentage) : 0
    const discountedAmount = discount
        ? (parseFloat(amount) * (1 - discountPercentage / 100)).toFixed(2)
        : amount
    const discountSavings = discount
        ? (parseFloat(amount) - parseFloat(discountedAmount)).toFixed(2)
        : "0"
    const isFreeRegistration = discount && discountPercentage >= 100

    const goToNextTab = () => {
        const currentIndex = TABS.indexOf(activeTab)
        if (currentIndex < TABS.length - 1) {
            setActiveTab(TABS[currentIndex + 1])
        }
    }

    if (paymentResult?.success) {
        return (
            <Card className="max-w-md">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                            <RiCheckLine className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                        <CardTitle>Registration Complete!</CardTitle>
                    </div>
                    <CardDescription>
                        Thank you for registering for the volleyball season.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                        {paymentResult.message}
                    </p>
                    {paymentResult.receiptUrl && (
                        <a
                            href={paymentResult.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-primary text-sm underline"
                        >
                            View Receipt
                        </a>
                    )}
                    <p className="pt-2 text-sm">
                        Now head over and make sure your{" "}
                        <Link
                            href="/dashboard/volleyball-profile"
                            className="font-medium text-primary underline"
                        >
                            Volleyball Profile
                        </Link>{" "}
                        is up-to-date so you get placed appropriately during
                        tryouts.
                    </p>
                </CardContent>
                <CardFooter>
                    <Button asChild className="w-full">
                        <Link href="/dashboard/volleyball-profile">
                            Continue to Volleyball Profile
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card className="max-w-2xl">
            <CardContent>
                <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as TabValue)}
                >
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="info">Info</TabsTrigger>
                        <TabsTrigger value="pairing">Pairing</TabsTrigger>
                        <TabsTrigger value="schedule">Schedule</TabsTrigger>
                        <TabsTrigger value="waivers">Waivers</TabsTrigger>
                        <TabsTrigger value="payment" disabled={!waiverAgreed}>
                            Payment
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="info" className="space-y-6 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="age">
                                Age at beginning of the season:
                            </Label>
                            <Select
                                value={formData.age}
                                onValueChange={(value) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        age: value,
                                        // Auto-enable pairing for players aged 15-14
                                        ...(value === "15-14"
                                            ? { pair: true }
                                            : {})
                                    }))
                                }
                            >
                                <SelectTrigger id="age">
                                    <SelectValue placeholder="Select your age range" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="20+">
                                        20 or older
                                    </SelectItem>
                                    <SelectItem value="19-18">19-18</SelectItem>
                                    <SelectItem value="17-16">17-16</SelectItem>
                                    <SelectItem value="15-14">15-14</SelectItem>
                                </SelectContent>
                            </Select>
                            {formData.age === "17-16" && (
                                <p className="text-amber-600 text-sm dark:text-amber-400">
                                    Players this age MUST have a parent/guardian
                                    present.
                                </p>
                            )}
                            {formData.age === "15-14" && (
                                <p className="text-amber-600 text-sm dark:text-amber-400">
                                    Players this age MUST pair with another
                                    player.
                                </p>
                            )}
                        </div>

                        <div className="space-y-3">
                            <Label>Interested in being a Captain?</Label>
                            <RadioGroup
                                value={formData.captain}
                                onValueChange={(value) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        captain: value
                                    }))
                                }
                                className="flex flex-col gap-2"
                            >
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem
                                        value="yes"
                                        id="captain-yes"
                                    />
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
                                    <RadioGroupItem
                                        value="no"
                                        id="captain-no"
                                    />
                                    <Label
                                        htmlFor="captain-no"
                                        className="cursor-pointer font-normal"
                                    >
                                        No
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div className="pt-4">
                            <Button onClick={goToNextTab} className="gap-2">
                                Next
                                <RiArrowRightLine className="h-4 w-4" />
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="pairing" className="space-y-6 pt-4">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            <p>
                                As a draft leauge we strongly discourage
                                requests to pair with another player and will
                                only accept them under very limited
                                circumstances (significant other, direct
                                relative, and in rare circumstances carpooling).
                                If requesting to pair, specify with whom to pair
                                and the reason for pairing. If you can not find
                                your pair below, have them to register on the
                                site before either of you sign up for the
                                season.{" "}
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
                                checked={formData.pair}
                                onCheckedChange={(checked: boolean) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        pair: checked,
                                        // Clear pair fields when turning off
                                        ...(checked
                                            ? {}
                                            : {
                                                  pairPick: null,
                                                  pairReason: ""
                                              })
                                    }))
                                }
                            />
                        </div>

                        {formData.pair && (
                            <>
                                <div className="space-y-2">
                                    <Label>Pair</Label>
                                    <UserCombobox
                                        users={users}
                                        value={formData.pairPick}
                                        onChange={(userId) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                pairPick: userId
                                            }))
                                        }
                                        placeholder="Select a player to pair with..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="pair-reason">
                                        Reason for pairing
                                    </Label>
                                    <Textarea
                                        id="pair-reason"
                                        value={formData.pairReason}
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                pairReason: e.target.value
                                            }))
                                        }
                                        placeholder="Why would you like to be paired with this player?"
                                        rows={3}
                                    />
                                </div>
                            </>
                        )}

                        <div className="pt-4">
                            <Button onClick={goToNextTab} className="gap-2">
                                Next
                                <RiArrowRightLine className="h-4 w-4" />
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="schedule" className="space-y-8 pt-4">
                        {/* Section 1: Dates Missing */}
                        <div className="space-y-4">
                            <h3 className="font-medium text-base">
                                Select which dates you will <strong>NOT</strong>{" "}
                                be able to play this season:
                            </h3>

                            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                {tryoutDates.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-muted-foreground text-sm">
                                            Tryouts
                                        </h4>
                                        <div className="space-y-2">
                                            {tryoutDates.map(
                                                ({ key, label }) => (
                                                    <div
                                                        key={key}
                                                        className="flex items-center gap-2"
                                                    >
                                                        <Checkbox
                                                            id={key}
                                                            checked={selectedDates.has(
                                                                label
                                                            )}
                                                            onCheckedChange={() =>
                                                                toggleDate(
                                                                    label
                                                                )
                                                            }
                                                        />
                                                        <Label
                                                            htmlFor={key}
                                                            className="cursor-pointer font-normal"
                                                        >
                                                            {label}
                                                        </Label>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                )}

                                {seasonDates.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-muted-foreground text-sm">
                                            Regular Season
                                        </h4>
                                        <div className="space-y-2">
                                            {seasonDates.map(
                                                ({ key, label }) => (
                                                    <div
                                                        key={key}
                                                        className="flex items-center gap-2"
                                                    >
                                                        <Checkbox
                                                            id={key}
                                                            checked={selectedDates.has(
                                                                label
                                                            )}
                                                            onCheckedChange={() =>
                                                                toggleDate(
                                                                    label
                                                                )
                                                            }
                                                        />
                                                        <Label
                                                            htmlFor={key}
                                                            className="cursor-pointer font-normal"
                                                        >
                                                            {label}
                                                        </Label>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                )}

                                {playoffDates.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-muted-foreground text-sm">
                                            Playoffs
                                        </h4>
                                        <div className="space-y-2">
                                            {playoffDates.map(
                                                ({ key, label }) => (
                                                    <div
                                                        key={key}
                                                        className="flex items-center gap-2"
                                                    >
                                                        <Checkbox
                                                            id={key}
                                                            checked={selectedDates.has(
                                                                label
                                                            )}
                                                            onCheckedChange={() =>
                                                                toggleDate(
                                                                    label
                                                                )
                                                            }
                                                        />
                                                        <Label
                                                            htmlFor={key}
                                                            className="cursor-pointer font-normal"
                                                        >
                                                            {label}
                                                        </Label>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {tryoutDates.length > 0 &&
                                tryoutDates.every(({ label }) =>
                                    selectedDates.has(label)
                                ) && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                        Are you sure you want to play this
                                        season? Missing all 3 tryouts makes it
                                        very hard for you to be placed on an
                                        appropriate team and you&apos;re very
                                        likely to end up on a team in a lower
                                        division.
                                    </div>
                                )}

                            {selectedDates.size >= 4 && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                    Are you sure you want to play this season?
                                    You&apos;ve listed quite a few dates that
                                    you will miss.
                                </div>
                            )}

                            {playoffDates.length > 0 &&
                                playoffDates.every(({ label }) =>
                                    selectedDates.has(label)
                                ) && (
                                    <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                                        Are you really going to miss all of the
                                        playoff matches? Captains have requested
                                        we only accept players who plan to play
                                        at least 1 match of the playoffs.
                                    </div>
                                )}
                        </div>

                        {/* Section 2: Week 1 Participation */}
                        <div className="space-y-3">
                            <h3 className="font-medium text-base">
                                Want to Play Tryouts Week 1?
                            </h3>
                            <p className="text-muted-foreground text-sm">
                                Week 1 of the tryouts is limited to 96 players
                                and will be mostly focused on skills drills for{" "}
                                <strong>NEW</strong> players.
                            </p>
                            <p className="text-muted-foreground text-sm">
                                Returning players who check here will be
                                considered for any available slots that week but
                                should NOT assume they will get to play. We will
                                contact all players directly who are requested
                                to attend the first week. You should consider
                                selecting this option if your skills have
                                changed significantly since last season you
                                played or have not played in more than 2
                                seasons.
                            </p>
                            <div className="flex items-center gap-2 pt-2">
                                <Checkbox
                                    id="play-1st-week"
                                    checked={formData.play1stWeek}
                                    onCheckedChange={(
                                        checked: boolean | "indeterminate"
                                    ) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            play1stWeek: checked === true
                                        }))
                                    }
                                />
                                <Label
                                    htmlFor="play-1st-week"
                                    className="cursor-pointer font-normal"
                                >
                                    Request to participate in week 1
                                </Label>
                            </div>
                        </div>

                        <div className="pt-4">
                            <Button onClick={goToNextTab} className="gap-2">
                                Next
                                <RiArrowRightLine className="h-4 w-4" />
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="waivers" className="space-y-6 pt-4">
                        <h3 className="font-medium text-base">
                            Liability and Conduct Waiver
                        </h3>

                        <div className="max-h-64 overflow-y-auto rounded-lg border p-4 text-muted-foreground text-sm leading-relaxed">
                            <p>
                                By checking the &quot;I Agree&quot; box below, I
                                hereby release, waive, discharge, and covenant
                                not to sue, or hold responsible, Bump Set Drink,
                                Inc. (BSD), Adventist HealthCare Fieldhouse
                                referees, other participants, and any persons in
                                a playing area, from all liability to you, your
                                personal representatives, assigned heirs, and
                                next of kin for any and all damage, and any
                                claim or demands thereof on account of injury to
                                you or your property or resulting in your death,
                                whether caused by the negligence or otherwise
                                while you are participating or working for or
                                observing BSD events. You expressly acknowledge
                                and agree that the activities at the event and
                                in the playing areas are dangerous and involve
                                the risk of serious injury and/or death and/or
                                property damage. You expressly acknowledge that
                                the activities at the event may involve the risk
                                of exposure to Covid-19 or other harmful
                                viruses. You consent to and will permit
                                emergency medical treatment if required. You
                                agree to allow your image to be used in
                                promotional and informational material. You have
                                read and agree to abide by the behavioral
                                policies stated on the BSD website. You
                                understand that this waiver may serve as the
                                only warning to action being taken for improper
                                behavior. You have read and voluntarily sign
                                this release and waiver of liability and
                                indemnity agreement which embraces each and
                                every event sanctioned, authorized or promoted
                                by the Bump Set Drink, Inc. league.
                            </p>
                            <p className="mt-4">
                                Submitting this online registration implies
                                compliance with the waiver and your agreement to
                                adhere to league rules as stated on the website.
                                This statement qualifies as the only warning
                                given — violations of the rules will not be
                                tolerated. By registering for this league you
                                will be held accountable for all league policies
                                and procedures.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="waiver-agree"
                                checked={waiverAgreed}
                                onCheckedChange={(
                                    checked: boolean | "indeterminate"
                                ) => setWaiverAgreed(checked === true)}
                            />
                            <Label
                                htmlFor="waiver-agree"
                                className="cursor-pointer font-medium"
                            >
                                I Agree
                            </Label>
                        </div>

                        <div className="pt-4">
                            <Button
                                onClick={goToNextTab}
                                disabled={!waiverAgreed}
                                className="gap-2"
                            >
                                Next
                                <RiArrowRightLine className="h-4 w-4" />
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="payment" className="space-y-6 pt-4">
                        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-center font-semibold text-red-800 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                            Reminder: NO REFUNDS for any reason
                        </div>

                        <div className="space-y-2 rounded-lg bg-muted p-4">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                    Volleyball Season Fee
                                </span>
                                {discount ? (
                                    <span className="font-semibold text-muted-foreground line-through">
                                        ${amount}
                                    </span>
                                ) : (
                                    <span className="font-semibold">
                                        ${amount}
                                    </span>
                                )}
                            </div>
                            {discount && (
                                <>
                                    <div className="flex justify-between text-green-600 dark:text-green-400">
                                        <span>
                                            Discount ({discount.percentage}%
                                            off)
                                        </span>
                                        <span>-${discountSavings}</span>
                                    </div>
                                    <div className="flex justify-between border-t pt-2">
                                        <span className="font-medium">
                                            Total
                                        </span>
                                        <span className="font-bold">
                                            ${discountedAmount}
                                        </span>
                                    </div>
                                </>
                            )}
                            {!discount &&
                                config.lateDate &&
                                config.lateAmount &&
                                (new Date(
                                    new Date().toLocaleString("en-US", {
                                        timeZone: "America/New_York"
                                    })
                                ) >= new Date(config.lateDate) ? (
                                    <p className="text-amber-600 text-xs dark:text-amber-400">
                                        Late registration pricing is in effect
                                        (after{" "}
                                        {new Date(
                                            config.lateDate
                                        ).toLocaleDateString()}
                                        )
                                    </p>
                                ) : (
                                    <p className="text-muted-foreground text-xs">
                                        Register before{" "}
                                        {new Date(
                                            config.lateDate
                                        ).toLocaleDateString()}{" "}
                                        to avoid the late fee of $
                                        {config.lateAmount}
                                    </p>
                                ))}
                        </div>

                        {paymentResult && !paymentResult.success && (
                            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
                                <RiErrorWarningLine className="h-5 w-5" />
                                <span className="text-sm">
                                    {paymentResult.message}
                                </span>
                            </div>
                        )}

                        {isFreeRegistration ? (
                            <div className="space-y-4">
                                <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-center dark:border-green-800 dark:bg-green-950">
                                    <p className="font-semibold text-green-800 dark:text-green-200">
                                        Your registration is fully covered!
                                    </p>
                                    <p className="mt-1 text-green-700 text-sm dark:text-green-300">
                                        No payment required.
                                    </p>
                                </div>
                                <Button
                                    onClick={async () => {
                                        setIsProcessing(true)
                                        setPaymentResult(null)
                                        try {
                                            const result =
                                                await submitFreeSignup(
                                                    formData,
                                                    discount!.id
                                                )
                                            setPaymentResult(result)
                                        } catch (_error) {
                                            setPaymentResult({
                                                success: false,
                                                message:
                                                    "An unexpected error occurred. Please try again."
                                            })
                                        } finally {
                                            setIsProcessing(false)
                                        }
                                    }}
                                    disabled={isProcessing}
                                    className="w-full"
                                    size="lg"
                                >
                                    {isProcessing
                                        ? "Processing..."
                                        : "Complete Free Registration"}
                                </Button>
                            </div>
                        ) : resolvedTheme == null ? null : (
                            <PaymentForm
                                key={resolvedTheme}
                                applicationId={appId}
                                locationId={locationId}
                                cardTokenizeResponseReceived={async (
                                    tokenResult
                                ) => {
                                    if (tokenResult.status !== "OK") {
                                        setPaymentResult({
                                            success: false,
                                            message:
                                                "Failed to process card. Please try again."
                                        })
                                        return
                                    }

                                    setIsProcessing(true)
                                    setPaymentResult(null)

                                    try {
                                        const result =
                                            await submitSeasonPayment(
                                                tokenResult.token,
                                                formData,
                                                discount?.id
                                            )
                                        setPaymentResult(result)
                                    } catch (_error) {
                                        setPaymentResult({
                                            success: false,
                                            message:
                                                "An unexpected error occurred. Please try again."
                                        })
                                    } finally {
                                        setIsProcessing(false)
                                    }
                                }}
                                createPaymentRequest={() => ({
                                    countryCode: "US",
                                    currencyCode: "USD",
                                    total: {
                                        amount: discountedAmount,
                                        label: "Volleyball Season Registration"
                                    }
                                })}
                            >
                                <CreditCard
                                    style={{
                                        ".input-container": {
                                            borderColor: "#e4e4e7",
                                            borderRadius: "6px"
                                        },
                                        ".input-container.is-focus": {
                                            borderColor: "#7c3aed"
                                        },
                                        input: {
                                            backgroundColor: "#ffffff",
                                            color: "#09090b",
                                            fontSize: "14px"
                                        },
                                        "input::placeholder": {
                                            color: "#71717a"
                                        },
                                        ".message-text": {
                                            color: "#71717a"
                                        },
                                        ".message-icon": {
                                            color: "#71717a"
                                        }
                                    }}
                                    buttonProps={{
                                        isLoading: isProcessing,
                                        css: {
                                            backgroundColor: "#7c3aed",
                                            color: "#ffffff",
                                            fontSize: "14px",
                                            fontWeight: "500",
                                            "&:hover": {
                                                backgroundColor: "#6d28d9"
                                            }
                                        }
                                    }}
                                />
                            </PaymentForm>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter>
                <p className="text-muted-foreground text-xs">
                    Your payment is securely processed by Square. We do not
                    store your card details.
                </p>
            </CardFooter>
        </Card>
    )
}
