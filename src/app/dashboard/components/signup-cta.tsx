import Link from "next/link"
import {
    getCurrentSeasonAmount,
    isLatePricing,
    getEventsByType,
    formatEventDate
} from "@/lib/site-config"
import type { SeasonSignupStatus } from "../queries"

export function SignupCTA({
    signupStatus,
    seasonLabel
}: {
    signupStatus: SeasonSignupStatus
    seasonLabel: string | null
}) {
    return (
        <div className="space-y-3">
            <p className="text-muted-foreground">
                You haven't signed up for the {seasonLabel} season yet.
            </p>
            <div className="space-y-1 rounded-lg bg-muted p-3">
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Season Fee:</span>
                    <span className="font-semibold">
                        ${getCurrentSeasonAmount(signupStatus.config)}
                    </span>
                </div>
                {(() => {
                    const lateDateEvent = getEventsByType(
                        signupStatus.config,
                        "late_date"
                    )[0]
                    return (
                        lateDateEvent &&
                        signupStatus.config.lateAmount &&
                        (isLatePricing(signupStatus.config) ? (
                            <p className="text-amber-600 text-xs dark:text-amber-400">
                                Late registration pricing in effect
                            </p>
                        ) : (
                            <p className="text-muted-foreground text-xs">
                                Price increases to $
                                {signupStatus.config.lateAmount} after{" "}
                                {formatEventDate(lateDateEvent.eventDate)}
                            </p>
                        ))
                    )
                })()}
            </div>
            <div className="flex gap-2">
                <Link
                    href="/dashboard/pay-season"
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
                >
                    Sign-up Now
                </Link>
                <Link
                    href="/season-info"
                    className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 font-medium text-sm hover:bg-accent hover:text-accent-foreground"
                >
                    More Info
                </Link>
            </div>
        </div>
    )
}
