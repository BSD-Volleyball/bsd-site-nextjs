import type { ReactNode } from "react"

interface Week1TryoutCalloutProps {
    dateLabel: string
    /**
     * Tailors the copy when the viewer's draft history is known: "new",
     * "likely" (a returning player who will almost certainly be scheduled
     * into week 1) and "returning" address that player directly; "all"
     * (default) addresses everyone, for surfaces that don't know who is
     * viewing.
     */
    audience?: "new" | "likely" | "returning" | "all"
    children?: ReactNode
}

export function Week1TryoutCallout({
    dateLabel,
    audience = "all",
    children
}: Week1TryoutCalloutProps) {
    return (
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <h4 className="font-medium text-blue-900 text-sm dark:text-blue-100">
                Week 1 Tryout &mdash; {dateLabel}
            </h4>
            <div className="space-y-2 text-blue-800 text-sm dark:text-blue-200">
                {audience === "new" && (
                    <p>
                        The Week 1 tryout is primarily focused on evaluating
                        players who are new to the league. Since this is your
                        first season, attending all three tryouts is important
                        &mdash; and the Week 1 tryout is especially important.
                        Please make every effort to attend.
                    </p>
                )}
                {audience === "likely" && (
                    <p>
                        The Week 1 tryout is focused on evaluating players who
                        are new to the league and returning players whose
                        placement needs another look. Based on your league
                        history, you will likely be scheduled for the Week 1
                        tryout &mdash; please plan to attend, and only mark
                        yourself unavailable below if you can&apos;t make it.
                    </p>
                )}
                {audience === "returning" && (
                    <p>
                        The Week 1 tryout is primarily focused on evaluating
                        players who are new to the league. As a returning
                        player, Week 1 is optional &mdash; but if extra slots
                        are available and you&apos;d like to be re-evaluated,
                        opt in below. Priority will be given to players who
                        haven&apos;t played in a while.
                    </p>
                )}
                {audience === "all" && (
                    <>
                        <p>
                            The Week 1 tryout is primarily focused on evaluating
                            players who are new to the league. If this is your
                            first season, please make every effort to attend.
                        </p>
                        <p>
                            Returning players: Week 1 is optional. If extra
                            slots are available and you&apos;d like to be
                            re-evaluated, mark yourself as available below
                            &mdash; priority will be given to players who
                            haven&apos;t played in a while.
                        </p>
                    </>
                )}
            </div>
            {children}
        </div>
    )
}
