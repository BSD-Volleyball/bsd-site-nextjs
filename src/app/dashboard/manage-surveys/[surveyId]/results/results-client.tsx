"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { StatusBanner } from "@/components/ui/status-banner"
import {
    buildCsvContent,
    buildTimestampedCsvFilename,
    downloadCsv
} from "@/lib/csv-download"
import {
    buildResponsesCsv,
    type SegmentFilter,
    type SurveyReport
} from "@/lib/surveys/reporting"
import {
    SURVEY_ROLE_TAG_LABELS,
    type SurveyGender,
    type SurveyQuestionDef,
    type SurveyRoleTag
} from "@/lib/surveys/types"
import { getSurveyRawResponses, getSurveyResults } from "../../actions"
import type { SurveyResultsSurveySummary } from "../../actions"
import { QuestionResultCard } from "./question-result-card"

const ALL = "all"

const GENDER_LABELS: Record<SurveyGender, string> = {
    male: "Male",
    non_male: "Non-male"
}

interface ResultsClientProps {
    surveyId: number
    initial: {
        report: SurveyReport
        questions: SurveyQuestionDef[]
        survey: SurveyResultsSurveySummary
    }
    divisions: { id: number; name: string }[]
}

function StatTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border px-4 py-3">
            <div className="font-semibold text-2xl">{value}</div>
            <div className="text-muted-foreground text-sm">{label}</div>
        </div>
    )
}

export function ResultsClient({
    surveyId,
    initial,
    divisions
}: ResultsClientProps) {
    const [survey] = useState(initial.survey)
    const [questions, setQuestions] = useState(initial.questions)
    const [report, setReport] = useState(initial.report)
    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [errorMessage, setErrorMessage] = useState("")

    const [roleTag, setRoleTag] = useState<string>(ALL)
    const [divisionId, setDivisionId] = useState<string>(ALL)
    const [gender, setGender] = useState<string>(ALL)

    const hasFilter = roleTag !== ALL || divisionId !== ALL || gender !== ALL

    useEffect(() => {
        let active = true
        setLoading(true)
        setErrorMessage("")

        const filter: SegmentFilter = {
            ...(roleTag !== ALL ? { roleTag: roleTag as SurveyRoleTag } : {}),
            ...(divisionId !== ALL ? { divisionId: Number(divisionId) } : {}),
            ...(gender !== ALL ? { gender: gender as SurveyGender } : {})
        }

        getSurveyResults(surveyId, filter)
            .then((result) => {
                if (!active) return
                if (result.status) {
                    setReport(result.data.report)
                    setQuestions(result.data.questions)
                } else {
                    setErrorMessage(result.message)
                }
            })
            .finally(() => {
                if (active) setLoading(false)
            })

        return () => {
            active = false
        }
    }, [surveyId, roleTag, divisionId, gender])

    async function handleExport() {
        setExporting(true)
        const result = await getSurveyRawResponses(surveyId)
        setExporting(false)
        if (!result.status) {
            setErrorMessage(result.message)
            return
        }
        const { headers, rows } = buildResponsesCsv(
            result.data.questions,
            result.data.responses,
            { anonymous: result.data.anonymous }
        )
        const content = buildCsvContent(headers, rows)
        downloadCsv(
            content,
            buildTimestampedCsvFilename("survey-responses", survey.title)
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-3">
                    <StatTile label="Invited" value={String(report.invited)} />
                    <StatTile
                        label="Submitted"
                        value={String(report.submitted)}
                    />
                    <StatTile
                        label="Response rate"
                        value={
                            report.responseRate !== null
                                ? `${report.responseRate}%`
                                : "—"
                        }
                    />
                    {hasFilter && (
                        <StatTile
                            label="Matching filter"
                            value={String(report.filteredCount)}
                        />
                    )}
                </div>
                <Button
                    type="button"
                    variant="outline"
                    disabled={exporting}
                    onClick={handleExport}
                >
                    {exporting ? "Exporting…" : "Export CSV"}
                </Button>
            </div>

            <div className="flex flex-wrap gap-4">
                <div className="w-48">
                    <Select value={roleTag} onValueChange={setRoleTag}>
                        <SelectTrigger>
                            <SelectValue placeholder="Role tag" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All role tags</SelectItem>
                            {Object.entries(SURVEY_ROLE_TAG_LABELS).map(
                                ([tag, info]) => (
                                    <SelectItem key={tag} value={tag}>
                                        {info.label}
                                    </SelectItem>
                                )
                            )}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-48">
                    <Select value={divisionId} onValueChange={setDivisionId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Division" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All divisions</SelectItem>
                            {divisions.map((division) => (
                                <SelectItem
                                    key={division.id}
                                    value={String(division.id)}
                                >
                                    {division.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-48">
                    <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger>
                            <SelectValue placeholder="Gender" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All genders</SelectItem>
                            {Object.entries(GENDER_LABELS).map(
                                ([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                        {label}
                                    </SelectItem>
                                )
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {errorMessage && (
                <StatusBanner variant="error">{errorMessage}</StatusBanner>
            )}

            {loading && (
                <p className="text-muted-foreground">Loading results…</p>
            )}

            {!loading && report.suppressed && (
                <StatusBanner variant="warning">
                    Fewer than 5 responses match this filter on an anonymous
                    survey, so results are hidden to protect respondent privacy.
                </StatusBanner>
            )}

            {!loading && !report.suppressed && (
                <div className="space-y-4">
                    {report.byQuestion.map(({ question, aggregate }) => (
                        <QuestionResultCard
                            key={question.id}
                            question={question}
                            aggregate={aggregate}
                        />
                    ))}
                    {questions.length === 0 && (
                        <p className="text-muted-foreground">
                            This survey has no questions.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
