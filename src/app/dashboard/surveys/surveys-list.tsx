import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { StatusBanner } from "@/components/ui/status-banner"
import { LEAGUE_TIME_ZONE } from "@/lib/date-utils"
import type { MySurveySummary } from "@/lib/surveys/respondent"

interface SurveysListProps {
    open: MySurveySummary[]
    past: MySurveySummary[]
}

/**
 * The two lists a respondent cares about: what is still waiting for them, and
 * what has already closed. Rendered on the server — nothing here is
 * interactive beyond the links.
 */
export function SurveysList({ open, past }: SurveysListProps) {
    if (open.length === 0 && past.length === 0) {
        return (
            <StatusBanner variant="info">
                You have not been invited to any surveys yet. When the league
                asks for your feedback, it will show up here.
            </StatusBanner>
        )
    }

    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <h2 className="font-semibold text-lg">Open</h2>
                {open.length === 0 ? (
                    <StatusBanner variant="info">
                        Nothing needs your answers right now.
                    </StatusBanner>
                ) : (
                    <div className="space-y-3">
                        {open.map((survey) => (
                            <SurveyRow key={survey.id} survey={survey} />
                        ))}
                    </div>
                )}
            </section>

            {past.length > 0 && (
                <section className="space-y-3">
                    <h2 className="font-semibold text-lg">Closed</h2>
                    <div className="space-y-3">
                        {past.map((survey) => (
                            <SurveyRow key={survey.id} survey={survey} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

function SurveyRow({ survey }: { survey: MySurveySummary }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{survey.title}</CardTitle>
                    <ProgressBadge survey={survey} />
                    {survey.isAnonymous && (
                        <Badge variant="outline">Anonymous</Badge>
                    )}
                </div>
                {survey.intro && (
                    <CardDescription className="line-clamp-2">
                        {survey.intro}
                    </CardDescription>
                )}
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-sm">
                    {deadlineLine(survey)}
                </p>
                <Link
                    href={`/dashboard/surveys/${survey.id}`}
                    className={buttonVariants({
                        size: "sm",
                        variant: survey.canEdit ? "default" : "outline"
                    })}
                >
                    {linkLabel(survey)}
                </Link>
            </CardContent>
        </Card>
    )
}

function ProgressBadge({ survey }: { survey: MySurveySummary }) {
    if (survey.responseStatus === "submitted") {
        return <Badge variant="secondary">Submitted</Badge>
    }
    if (survey.responseStatus === "in_progress") {
        return <Badge variant="secondary">In progress</Badge>
    }
    return <Badge>Not started</Badge>
}

function linkLabel(survey: MySurveySummary): string {
    if (!survey.canEdit) {
        return survey.responseStatus === "submitted"
            ? "View answers"
            : "View survey"
    }
    if (survey.responseStatus === "submitted") return "Change answers"
    return survey.responseStatus === "in_progress" ? "Continue" : "Start"
}

function deadlineLine(survey: MySurveySummary): string {
    if (survey.canEdit) {
        return survey.closesAt
            ? `Closes ${formatClosesAt(survey.closesAt)}`
            : "No deadline"
    }
    if (survey.isAnonymous && survey.responseStatus === "submitted") {
        return "Submitted anonymously — answers can no longer be changed."
    }
    return survey.closesAt
        ? `Closed ${formatClosesAt(survey.closesAt)}`
        : "Closed"
}

function formatClosesAt(closesAt: Date): string {
    return closesAt.toLocaleString("en-US", {
        timeZone: LEAGUE_TIME_ZONE,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    })
}
