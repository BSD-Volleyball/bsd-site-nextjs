"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { StatusBanner } from "@/components/ui/status-banner"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { LEAGUE_TIME_ZONE } from "@/lib/date-utils"
import type { SurveyListRow } from "@/lib/surveys/surveys"
import type { TemplateSummary } from "@/lib/surveys/templates"
import { NewSurveyDialog } from "./new-survey-dialog"

interface SurveysListProps {
    surveys: SurveyListRow[]
    templates: TemplateSummary[]
    seasons: { id: number; label: string }[]
}

function statusVariant(
    status: SurveyListRow["status"]
): "default" | "outline" | "secondary" {
    if (status === "open") return "default"
    if (status === "closed") return "secondary"
    return "outline"
}

function formatDate(date: Date | null): string {
    if (!date) return "—"
    return date.toLocaleString("en-US", {
        timeZone: LEAGUE_TIME_ZONE,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    })
}

/** The Surveys tab: every survey instance, newest first, with a "New survey" launcher. */
export function SurveysList({ surveys, templates, seasons }: SurveysListProps) {
    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <NewSurveyDialog templates={templates} seasons={seasons} />
            </div>

            {surveys.length === 0 ? (
                <StatusBanner variant="info">
                    No surveys yet. Create one from a template to get started.
                </StatusBanner>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Template</TableHead>
                            <TableHead>Season</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Responses</TableHead>
                            <TableHead>Closes</TableHead>
                            <TableHead>Reminders</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {surveys.map((survey) => (
                            <TableRow key={survey.id}>
                                <TableCell>
                                    <Link
                                        href={`/dashboard/manage-surveys/${survey.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {survey.title}
                                    </Link>
                                    {survey.isAnonymous && (
                                        <Badge
                                            variant="outline"
                                            className="ml-2"
                                        >
                                            Anonymous
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell>{survey.templateName}</TableCell>
                                <TableCell>
                                    {survey.seasonLabel ?? "—"}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant={statusVariant(survey.status)}
                                    >
                                        {survey.status}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {survey.submitted}/{survey.recipients}
                                </TableCell>
                                <TableCell>
                                    {formatDate(survey.closesAt)}
                                </TableCell>
                                <TableCell>
                                    {survey.reminderCount}/
                                    {survey.reminderMaxCount}
                                </TableCell>
                                <TableCell>
                                    {(survey.status === "open" ||
                                        survey.status === "closed") && (
                                        <Link
                                            href={`/dashboard/manage-surveys/${survey.id}/results`}
                                            className="text-primary text-sm hover:underline"
                                        >
                                            Results
                                        </Link>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    )
}
