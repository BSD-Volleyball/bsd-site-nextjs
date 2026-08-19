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
import { UserCombobox } from "@/components/user-combobox"
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
    RiCheckboxCircleLine,
    RiErrorWarningLine,
    RiArrowRightLine
} from "@remixicon/react"
import {
    AGE_GROUPS,
    DEFAULT_AGE_GROUP,
    PAIR_REQUIRED_AGE_GROUP
} from "@/lib/age-groups"
import { SeasonVolunteerQuestions } from "@/components/season-volunteer-questions"
import type { SeasonConfig } from "@/lib/season-types"
import { getEventsByType, formatEventDate } from "@/lib/season-utils"
import Link from "next/link"
import { WaiverContent } from "@/components/waiver-content"
import { Week1TryoutCallout } from "@/components/week1-tryout-callout"
import {
    isMissingAllPlayoffs,
    isMissingAllTryouts,
    isMissingManyDates
} from "./availability-warnings"
import { SubListOffer } from "./sub-list-offer"
import {
    defaultWeek1Unavailable,
    effectiveWeek1Audience,
    type Week1Audience
} from "@/app/dashboard/create-week-1/week1-priority"

interface User {
    id: string
    name: string
}

interface WizardFormProps {
    amount: string
    users: User[]
    config: SeasonConfig
    discount: { id: number; percentage: string } | null
    activeWaiver: { id: number; content: string } | null
    // Which week 1 callout/default this player gets (see week1-priority.ts).
    week1Audience: Week1Audience
    // True when a past signup already recorded "20 or older" for this player.
    // The age question is skipped entirely and DEFAULT_AGE_GROUP is submitted.
    isKnownAdult: boolean
    seasonLabel: string
    // Set when a signups row already exists for this player+season. Rendered
    // here (not by the server page) so the post-payment router.refresh()
    // keeps this component mounted and the success card visible — a fresh
    // visit has no paymentResult state and falls through to this notice.
    existingSignup: { amountPaid: string | null; signedUpAt: Date } | null
}

const TABS = ["info", "pairing", "schedule", "waivers", "payment"] as const
type TabValue = (typeof TABS)[number]

export function WizardForm({
    amount,
    users,
    config,
    discount,
    activeWaiver,
    week1Audience,
    isKnownAdult,
    seasonLabel,
    existingSignup
}: WizardFormProps) {
    const router = useRouter()
    const { resolvedTheme } = useTheme()
    const _isDark = resolvedTheme === "dark"
    const [activeTab, setActiveTab] = useState<TabValue>("info")

    const tryoutEvents = getEventsByType(config, "tryout")
    const seasonEvents = getEventsByType(config, "regular_season")
    const playoffEvents = getEventsByType(config, "playoff")
    const week1Tryout = tryoutEvents[0] ?? null
    const laterTryoutIds = tryoutEvents.slice(1, 3).map((event) => event.id)

    // Plain returning players default to sitting out week 1 (they opt in via
    // the "Opt-in to Evaluations" checkbox); new and likely-scheduled players
    // default to attending.
    const initialUnavailableIds =
        defaultWeek1Unavailable(week1Audience) && week1Tryout
            ? [week1Tryout.id]
            : []

    const [formData, setFormData] = useState<SignupFormData>({
        age: DEFAULT_AGE_GROUP,
        captain: "no",
        pair: false,
        pairPick: null,
        pairReason: "",
        refInterest: false,
        tryoutHelp: false,
        unavailableEventIds: initialUnavailableIds
    })
    const [selectedEvents, setSelectedEvents] = useState<Set<number>>(
        () => new Set(initialUnavailableIds)
    )
    const [waiverAgreed, setWaiverAgreed] = useState(false)
    // Set once the player has made their own week 1 choice; until then the
    // week 1 default follows the audience as it changes live (below).
    const [week1Touched, setWeek1Touched] = useState(false)

    // Missing tryout 2 or 3 moves a plain returning player into a week 1
    // priority bucket, so the callout upgrades them to "likely" live.
    const missesTryout2Or3 = (events: Set<number>) =>
        laterTryoutIds.some((id) => events.has(id))
    const audience = effectiveWeek1Audience(
        week1Audience,
        missesTryout2Or3(selectedEvents)
    )
    const isOptInAudience = audience === "returning"

    // Schedule-tab warnings. Any one of them also surfaces the sub-list offer,
    // which renders once below them rather than per-warning.
    const missingAllTryouts = isMissingAllTryouts(tryoutEvents, selectedEvents)
    const missingManyDates = isMissingManyDates(selectedEvents)
    const missingAllPlayoffs = isMissingAllPlayoffs(
        playoffEvents,
        selectedEvents
    )
    const showSubListOffer =
        missingAllTryouts || missingManyDates || missingAllPlayoffs

    const toggleEvent = (eventId: number) => {
        const isWeek1 = week1Tryout?.id === eventId
        if (isWeek1) {
            setWeek1Touched(true)
        }
        setSelectedEvents((prev) => {
            const newSet = new Set(prev)
            if (newSet.has(eventId)) {
                newSet.delete(eventId)
            } else {
                newSet.add(eventId)
            }
            // Toggling tryout 2/3 can change the audience; keep the week 1
            // default in step unless the player already chose for themselves.
            if (week1Tryout && !isWeek1 && !week1Touched) {
                const nextAudience = effectiveWeek1Audience(
                    week1Audience,
                    missesTryout2Or3(newSet)
                )
                if (defaultWeek1Unavailable(nextAudience)) {
                    newSet.add(week1Tryout.id)
                } else {
                    newSet.delete(week1Tryout.id)
                }
            }
            // Update formData with array of event IDs
            setFormData((f) => ({
                ...f,
                unavailableEventIds: Array.from(newSet)
            }))
            return newSet
        })
    }

    const [isProcessing, setIsProcessing] = useState(false)
    const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(
        null
    )

    // Refresh the page data when payment succeeds to update sidebar
    useEffect(() => {
        if (paymentResult?.status) {
            router.refresh()
        }
    }, [paymentResult?.status, router])

    useEffect(() => {
        if (
            paymentResult &&
            !paymentResult.status &&
            paymentResult.shouldRefresh
        ) {
            router.refresh()
        }
    }, [paymentResult, router])

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

    // Rendered above the "dates you will NOT be able to play" heading for
    // opt-in returning players (whose control is a positive opt-in) and
    // below it for new / likely-scheduled players (whose control matches
    // the heading's semantics).
    const week1CalloutBlock = week1Tryout && (
        <Week1TryoutCallout
            audience={audience}
            dateLabel={formatEventDate(week1Tryout.eventDate)}
        >
            {isOptInAudience ? (
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`event-${week1Tryout.id}`}
                        checked={!selectedEvents.has(week1Tryout.id)}
                        onCheckedChange={() => toggleEvent(week1Tryout.id)}
                    />
                    <Label
                        htmlFor={`event-${week1Tryout.id}`}
                        className="cursor-pointer font-normal"
                    >
                        Opt-in to Evaluations
                    </Label>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={`event-${week1Tryout.id}`}
                        checked={selectedEvents.has(week1Tryout.id)}
                        onCheckedChange={() => toggleEvent(week1Tryout.id)}
                    />
                    <Label
                        htmlFor={`event-${week1Tryout.id}`}
                        className="cursor-pointer font-normal"
                    >
                        I will <strong>NOT</strong> be able to attend the Week 1
                        tryout
                    </Label>
                </div>
            )}
        </Week1TryoutCallout>
    )

    // League rules: 14-15 year olds must be paired with a registered
    // parent/guardian. The server action rejects such signups without a pair
    // pick; the wizard mirrors that by locking the pair toggle on and blocking
    // every tab past Pairing until a pair is selected.
    const pairRequired = formData.age === PAIR_REQUIRED_AGE_GROUP
    const missingRequiredPair = pairRequired && !formData.pairPick

    const goToNextTab = () => {
        const currentIndex = TABS.indexOf(activeTab)
        if (currentIndex < TABS.length - 1) {
            setActiveTab(TABS[currentIndex + 1])
        }
    }

    if (paymentResult?.status) {
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

    if (existingSignup) {
        return (
            <div className="rounded-lg border-2 border-green-600/40 bg-green-50 p-6 dark:bg-green-950/30">
                <div className="flex items-start gap-3">
                    <RiCheckboxCircleLine className="mt-0.5 size-6 shrink-0 text-green-600 dark:text-green-400" />
                    <div className="space-y-2">
                        <h2 className="font-semibold text-green-800 text-lg dark:text-green-300">
                            You&apos;re already registered
                            {seasonLabel
                                ? ` for the ${seasonLabel} season`
                                : ""}
                            !
                        </h2>
                        <p className="text-green-700 text-sm dark:text-green-400">
                            Our records show you signed up
                            {existingSignup.amountPaid &&
                            Number(existingSignup.amountPaid) > 0
                                ? ` and paid $${existingSignup.amountPaid}`
                                : ""}{" "}
                            on{" "}
                            {existingSignup.signedUpAt.toLocaleDateString(
                                "en-US",
                                {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric"
                                }
                            )}
                            . There&apos;s no need to sign up again.
                        </p>
                        <Button asChild size="sm" className="mt-1">
                            <Link href="/dashboard">Back to Dashboard</Link>
                        </Button>
                    </div>
                </div>
            </div>
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
                        <TabsTrigger
                            value="schedule"
                            disabled={missingRequiredPair}
                        >
                            Schedule
                        </TabsTrigger>
                        <TabsTrigger
                            value="waivers"
                            disabled={missingRequiredPair}
                        >
                            Waivers
                        </TabsTrigger>
                        <TabsTrigger
                            value="payment"
                            disabled={!waiverAgreed || missingRequiredPair}
                        >
                            Payment
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="info" className="space-y-6 pt-4">
                        {!isKnownAdult && (
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
                                            ...(value ===
                                            PAIR_REQUIRED_AGE_GROUP
                                                ? { pair: true }
                                                : {})
                                        }))
                                    }
                                >
                                    <SelectTrigger id="age">
                                        <SelectValue placeholder="Select your age range" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[...AGE_GROUPS]
                                            .reverse()
                                            .map((group) => (
                                                <SelectItem
                                                    key={group.value}
                                                    value={group.value}
                                                >
                                                    {group.label}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                                {formData.age === "17-16" && (
                                    <p className="text-amber-600 text-sm dark:text-amber-400">
                                        Players this age MUST have a
                                        parent/guardian present.
                                    </p>
                                )}
                                {pairRequired && (
                                    <p className="text-amber-600 text-sm dark:text-amber-400">
                                        Players this age MUST pair with a
                                        parent/guardian who is registered for
                                        the season. Your parent/guardian must
                                        register first — you will select them on
                                        the Pairing tab before you can finish
                                        signing up.
                                    </p>
                                )}
                            </div>
                        )}

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

                        <div className="space-y-4 border-t pt-6">
                            <SeasonVolunteerQuestions
                                refInterest={formData.refInterest}
                                tryoutHelp={formData.tryoutHelp}
                                onRefInterestChange={(value) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        refInterest: value
                                    }))
                                }
                                onTryoutHelpChange={(value) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        tryoutHelp: value
                                    }))
                                }
                                idPrefix="signup-"
                            />
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
                                your pair below, they likely haven&apos;t
                                registered yet — you can come back and select
                                them from your My Season Preferences page after
                                signing up, once they&apos;ve registered.{" "}
                            </p>
                        </div>

                        {pairRequired && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                <p>
                                    Players aged 14-15 MUST pair with a
                                    parent/guardian and cannot finish signing up
                                    until that pair is selected below. If your
                                    parent/guardian is not in the list, they
                                    haven&apos;t registered yet — they must
                                    register first, then return here to complete
                                    your signup.
                                </p>
                            </div>
                        )}

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
                                disabled={pairRequired}
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
                            <Button
                                onClick={goToNextTab}
                                disabled={missingRequiredPair}
                                className="gap-2"
                            >
                                Next
                                <RiArrowRightLine className="h-4 w-4" />
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="schedule" className="space-y-8 pt-4">
                        {/* Section 1: Dates Missing */}
                        <div className="space-y-4">
                            {isOptInAudience && week1CalloutBlock}

                            <h3 className="font-medium text-base">
                                Select which dates you will <strong>NOT</strong>{" "}
                                be able to play this season:
                            </h3>

                            {!isOptInAudience && week1CalloutBlock}

                            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                {tryoutEvents.length > 1 && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-muted-foreground text-sm">
                                            Tryouts (Weeks 2 &amp; 3)
                                        </h4>
                                        <div className="space-y-2">
                                            {tryoutEvents
                                                .slice(1)
                                                .map((event) => (
                                                    <div
                                                        key={event.id}
                                                        className="flex items-center gap-2"
                                                    >
                                                        <Checkbox
                                                            id={`event-${event.id}`}
                                                            checked={selectedEvents.has(
                                                                event.id
                                                            )}
                                                            onCheckedChange={() =>
                                                                toggleEvent(
                                                                    event.id
                                                                )
                                                            }
                                                        />
                                                        <Label
                                                            htmlFor={`event-${event.id}`}
                                                            className="cursor-pointer font-normal"
                                                        >
                                                            {formatEventDate(
                                                                event.eventDate
                                                            )}
                                                        </Label>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}

                                {seasonEvents.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-muted-foreground text-sm">
                                            Regular Season
                                        </h4>
                                        <div className="space-y-2">
                                            {seasonEvents.map((event) => (
                                                <div
                                                    key={event.id}
                                                    className="flex items-center gap-2"
                                                >
                                                    <Checkbox
                                                        id={`event-${event.id}`}
                                                        checked={selectedEvents.has(
                                                            event.id
                                                        )}
                                                        onCheckedChange={() =>
                                                            toggleEvent(
                                                                event.id
                                                            )
                                                        }
                                                    />
                                                    <Label
                                                        htmlFor={`event-${event.id}`}
                                                        className="cursor-pointer font-normal"
                                                    >
                                                        {formatEventDate(
                                                            event.eventDate
                                                        )}
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {playoffEvents.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-muted-foreground text-sm">
                                            Playoffs
                                        </h4>
                                        <div className="space-y-2">
                                            {playoffEvents.map((event) => (
                                                <div
                                                    key={event.id}
                                                    className="flex items-center gap-2"
                                                >
                                                    <Checkbox
                                                        id={`event-${event.id}`}
                                                        checked={selectedEvents.has(
                                                            event.id
                                                        )}
                                                        onCheckedChange={() =>
                                                            toggleEvent(
                                                                event.id
                                                            )
                                                        }
                                                    />
                                                    <Label
                                                        htmlFor={`event-${event.id}`}
                                                        className="cursor-pointer font-normal"
                                                    >
                                                        {formatEventDate(
                                                            event.eventDate
                                                        )}
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {missingAllTryouts && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                    Are you sure you want to play this season?
                                    Missing all 3 tryouts makes it very hard for
                                    you to be placed on an appropriate team and
                                    you&apos;re very likely to end up on a team
                                    in a lower division.
                                </div>
                            )}

                            {missingManyDates && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                    Are you sure you want to play this season?
                                    You&apos;ve listed quite a few dates that
                                    you will miss.
                                </div>
                            )}

                            {missingAllPlayoffs && (
                                <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                                    Are you really going to miss all of the
                                    playoff matches? Captains have requested we
                                    only accept players who plan to play at
                                    least 1 match of the playoffs.
                                </div>
                            )}

                            {showSubListOffer && (
                                <SubListOffer
                                    seasonId={config.seasonId}
                                    activeWaiver={activeWaiver}
                                />
                            )}
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

                        {activeWaiver ? (
                            <>
                                <WaiverContent content={activeWaiver.content} />

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
                            </>
                        ) : (
                            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                                No active waiver is currently published. Please
                                contact an administrator before continuing.
                            </div>
                        )}
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
                                (() => {
                                    const lateDateStr = getEventsByType(
                                        config,
                                        "late_date"
                                    )[0]?.eventDate
                                    if (!lateDateStr || !config.lateAmount)
                                        return null
                                    const isLate =
                                        new Date(
                                            new Date().toLocaleString("en-US", {
                                                timeZone: "America/New_York"
                                            })
                                        ) >= new Date(`${lateDateStr}T00:00:00`)
                                    return isLate ? (
                                        <p className="text-amber-600 text-sm dark:text-amber-400">
                                            Late registration pricing is in
                                            effect (after{" "}
                                            {formatEventDate(lateDateStr)})
                                        </p>
                                    ) : (
                                        <p className="text-muted-foreground text-sm">
                                            Register before{" "}
                                            {formatEventDate(lateDateStr)} to
                                            avoid the late fee of $
                                            {config.lateAmount}
                                        </p>
                                    )
                                })()}
                        </div>

                        {paymentResult && !paymentResult.status && (
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
                                                    discount!.id,
                                                    activeWaiver!.id
                                                )
                                            setPaymentResult(result)
                                        } catch (_error) {
                                            setPaymentResult({
                                                status: false,
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
                                            status: false,
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
                                                activeWaiver!.id,
                                                discount?.id
                                            )
                                        setPaymentResult(result)
                                    } catch (_error) {
                                        setPaymentResult({
                                            status: false,
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
                <p className="text-muted-foreground text-sm">
                    Your payment is securely processed by Square. We do not
                    store your card details.
                </p>
            </CardFooter>
        </Card>
    )
}
