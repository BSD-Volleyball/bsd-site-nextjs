import Link from "next/link"
import { RiCheckLine } from "@remixicon/react"
import { WaitlistButton } from "../waitlist-button"
import type { SeasonSignupStatus } from "../queries"

export function WaitlistContent({
    signupStatus,
    seasonLabel,
    waitlistSeasonId,
    activeWaiver
}: {
    signupStatus: SeasonSignupStatus
    seasonLabel: string | null
    waitlistSeasonId: number | null
    activeWaiver: { id: number; content: string } | null
}) {
    return (
        <div className="space-y-3">
            <p className="text-muted-foreground">
                The {seasonLabel} season is currently full.
            </p>
            {signupStatus.onWaitlist ? (
                signupStatus.waitlistApproved ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                                <RiCheckLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                            </div>
                            <p className="font-medium text-green-700 text-sm dark:text-green-400">
                                You have been approved from the waitlist and can
                                now complete your registration.
                            </p>
                        </div>
                        <Link
                            href="/dashboard/pay-season"
                            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
                        >
                            Sign-up Now
                        </Link>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900">
                            <RiCheckLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <p className="font-medium text-blue-700 text-sm dark:text-blue-400">
                            You've expressed interest in playing. We'll reach
                            out if a spot opens up!
                        </p>
                    </div>
                )
            ) : (
                <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">
                        There are occasionally drop-outs, injuries, or
                        scheduling conflicts. Click here to express your
                        interest in a spot in the league if one opens up or
                        possibly a substitute if needed.
                    </p>
                    <WaitlistButton
                        seasonId={waitlistSeasonId!}
                        activeWaiver={activeWaiver}
                    />
                </div>
            )}
        </div>
    )
}
