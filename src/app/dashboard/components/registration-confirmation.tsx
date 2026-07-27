import Link from "next/link"
import { RiCheckLine } from "@remixicon/react"
import { canEditPreferences } from "../captain-pairing/utils"
import type { SeasonSignupStatus } from "../queries"

export function RegistrationConfirmation({
    signupStatus
}: {
    signupStatus: SeasonSignupStatus
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                    <RiCheckLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                    <p className="font-medium text-green-700 dark:text-green-400">
                        You're registered!
                    </p>
                    <p className="text-muted-foreground text-sm">
                        Paid ${signupStatus.signup!.amount_paid} on{" "}
                        {new Date(
                            signupStatus.signup!.created_at
                        ).toLocaleDateString("en-US")}
                    </p>
                </div>
            </div>

            <div className="space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">
                        Captain Interest:
                    </span>
                    <span className="font-medium capitalize">
                        {signupStatus.signup!.captain === "yes"
                            ? "Yes"
                            : signupStatus.signup!.captain === "only_if_needed"
                              ? "Only if needed"
                              : "No"}
                    </span>
                </div>

                {signupStatus.pairPickName && (
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">
                            Pair Request:
                        </span>
                        <span className="font-medium">
                            {signupStatus.pairPickName}
                        </span>
                    </div>
                )}

                {signupStatus.unavailableDates && (
                    <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground">
                            Dates Unavailable:
                        </span>
                        <span className="font-medium text-xs">
                            {signupStatus.unavailableDates}
                        </span>
                    </div>
                )}
            </div>

            {canEditPreferences(signupStatus.config.phase) && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Link
                        href="/dashboard/captain-pairing"
                        className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 font-medium text-sm hover:bg-accent"
                    >
                        Edit captain & pairing
                    </Link>
                    <Link
                        href="/dashboard/my-availability"
                        className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 font-medium text-sm hover:bg-accent"
                    >
                        Edit availability
                    </Link>
                </div>
            )}
        </div>
    )
}
