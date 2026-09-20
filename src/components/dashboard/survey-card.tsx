import { RiSurveyLine } from "@remixicon/react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatLeagueDateTime } from "@/lib/surveys/format"
import type { MySurveySummary } from "@/lib/surveys/respondent"

/**
 * The nudge on the dashboard. The caller passes only the surveys that are
 * still waiting for an answer, so the card is hidden the moment the last one
 * is submitted.
 */
export function SurveyCard({ surveys }: { surveys: MySurveySummary[] }) {
    if (surveys.length === 0) return null

    const single = surveys.length === 1 ? surveys[0] : null

    return (
        <Card className="min-w-[280px] flex-1 border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiSurveyLine className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    <CardTitle className="text-indigo-700 text-lg dark:text-indigo-300">
                        {single
                            ? `You have an open survey: ${single.title}`
                            : `You have ${surveys.length} open surveys`}
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-indigo-700 text-sm dark:text-indigo-300">
                    {single
                        ? deadlineLine(single)
                        : "The league is asking for your feedback — each one takes just a few minutes."}
                </p>
                <div className="flex flex-col items-start gap-2">
                    {surveys.map((survey) => (
                        <Link
                            key={survey.id}
                            href={`/dashboard/surveys/${survey.id}`}
                            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 font-medium text-sm text-white hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600"
                        >
                            {single ? linkLabel(survey) : survey.title}
                        </Link>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}

function linkLabel(survey: MySurveySummary): string {
    return survey.responseStatus === "in_progress"
        ? "Finish the survey"
        : "Take the survey"
}

function deadlineLine(survey: MySurveySummary): string {
    if (!survey.closesAt) {
        return "It only takes a few minutes, and your answers save as you go."
    }
    return `It closes ${formatLeagueDateTime(survey.closesAt)}.`
}
