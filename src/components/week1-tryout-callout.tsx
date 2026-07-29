import type { ReactNode } from "react"

interface Week1TryoutCalloutProps {
    dateLabel: string
    children?: ReactNode
}

export function Week1TryoutCallout({
    dateLabel,
    children
}: Week1TryoutCalloutProps) {
    return (
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <h4 className="font-medium text-blue-900 text-sm dark:text-blue-100">
                Week 1 Tryout &mdash; {dateLabel}
            </h4>
            <div className="space-y-2 text-blue-800 text-sm dark:text-blue-200">
                <p>
                    The Week 1 tryout is primarily focused on evaluating players
                    who are new to the league. If this is your first season,
                    please make every effort to attend.
                </p>
                <p>
                    Returning players: Week 1 is optional. If extra slots are
                    available and you&apos;d like to be re-evaluated, mark
                    yourself as available below &mdash; priority will be given
                    to players who haven&apos;t played in a while.
                </p>
            </div>
            {children}
        </div>
    )
}
