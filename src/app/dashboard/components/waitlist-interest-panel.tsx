import Link from "next/link"
import { RiCheckLine } from "@remixicon/react"
import { WaitlistButton } from "../waitlist-button"
import type { SeasonSignupStatus } from "../queries"

export function WaitlistInterestPanel({
    signupStatus,
    waitlistSeasonId,
    pitch,
    activeWaiver
}: {
    signupStatus: SeasonSignupStatus
    waitlistSeasonId: number | null
    pitch: string
    activeWaiver: { id: number; content: string } | null
}) {
    if (signupStatus.onWaitlist) {
        if (signupStatus.waitlistApproved) {
            return (
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                            <RiCheckLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <p className="font-medium text-green-700 text-sm dark:text-green-400">
                            You've been approved from the waitlist! Please sign
                            up for the season now.
                        </p>
                    </div>
                    <Link
                        href="/dashboard/pay-season"
                        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
                    >
                        Sign-up Now
                    </Link>
                </div>
            )
        }
        return (
            <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900">
                    <RiCheckLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="font-medium text-blue-700 text-sm dark:text-blue-400">
                    You've expressed interest in playing. We'll reach out if a
                    spot opens up!
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            <p className="text-muted-foreground text-sm">{pitch}</p>
            <WaitlistButton
                seasonId={waitlistSeasonId!}
                activeWaiver={activeWaiver}
            />
        </div>
    )
}
