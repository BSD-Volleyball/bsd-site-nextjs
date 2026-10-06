import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Captain homework nudges: week 2 movement recommendations, and draft
// planning before the division's live draft.

function HomeworkCard({
    title,
    body,
    href,
    action
}: {
    title: string
    body: string
    href: string
    action: string
}) {
    return (
        <Card className="min-w-[280px] flex-1 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <CardHeader className="pb-2">
                <CardTitle className="text-blue-700 text-lg dark:text-blue-300">
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-blue-700 text-sm dark:text-blue-300">
                    {body}
                </p>
                <Link
                    href={href}
                    className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                >
                    {action}
                </Link>
            </CardContent>
        </Card>
    )
}

export function Week2HomeworkCard() {
    return (
        <HomeworkCard
            title="Submit Your Week 2 Homework"
            body="As a Week 2 captain, please submit your player movement recommendations by Monday morning."
            href="/dashboard/week-2-homework"
            action="Go to Week 2 Homework"
        />
    )
}

export function DraftHomeworkCard() {
    return (
        <HomeworkCard
            title="Complete Your Draft Homework"
            body="As a captain, please review the available players and plan your draft picks before the live draft begins."
            href="/dashboard/draft-homework"
            action="Go to Draft Homework"
        />
    )
}
