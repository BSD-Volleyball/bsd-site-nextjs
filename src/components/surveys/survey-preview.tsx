"use client"

import { useMemo, useState } from "react"
import { QuestionInput } from "@/components/surveys/question-input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { StatusBanner } from "@/components/ui/status-banner"
import {
    type AnswerMap,
    type AnswerValue,
    SURVEY_ROLE_TAG_LABELS,
    SURVEY_ROLE_TAGS,
    type SurveyQuestionDef,
    type SurveyRoleTag
} from "@/lib/surveys/types"
import { evaluateVisibility } from "@/lib/surveys/visibility"

interface SurveyPreviewProps {
    questions: SurveyQuestionDef[]
    roleTags: SurveyRoleTag[]
}

/**
 * The template as a respondent would meet it: answers live in local state,
 * branching is re-evaluated on every change, and nothing is persisted.
 *
 * Only the tags some question actually gates on are offered as toggles —
 * everything else would change nothing on screen.
 */
export function SurveyPreview({ questions, roleTags }: SurveyPreviewProps) {
    const [answers, setAnswers] = useState<AnswerMap>({})
    const [activeTags, setActiveTags] = useState<SurveyRoleTag[]>(roleTags)

    const gatingTags = useMemo(() => {
        const used = new Set<SurveyRoleTag>(roleTags)
        for (const question of questions) {
            for (const tag of question.visibility?.roleTags ?? []) {
                used.add(tag)
            }
        }
        return SURVEY_ROLE_TAGS.filter((tag) => used.has(tag))
    }, [questions, roleTags])

    const ordered = useMemo(
        () =>
            [...questions].sort(
                (a, b) => a.sortOrder - b.sortOrder || a.id - b.id
            ),
        [questions]
    )

    const visible = useMemo(
        () =>
            evaluateVisibility({
                questions,
                answers,
                roleTags: activeTags
            }),
        [questions, answers, activeTags]
    )

    /**
     * Store the answer, then forget any answer whose question the change just
     * hid. A hidden question's answer is never read back by the evaluator, so
     * one pass settles the list.
     */
    function handleAnswer(questionId: number, value: AnswerValue | undefined) {
        setAnswers((previous) => {
            const next: AnswerMap = { ...previous }
            if (value === undefined) {
                delete next[questionId]
            } else {
                next[questionId] = value
            }

            const stillVisible = evaluateVisibility({
                questions,
                answers: next,
                roleTags: activeTags
            })
            for (const key of Object.keys(next)) {
                if (!stillVisible.has(Number(key))) {
                    delete next[Number(key)]
                }
            }
            return next
        })
    }

    function toggleTag(tag: SurveyRoleTag, checked: boolean) {
        const next = checked
            ? [...activeTags, tag]
            : activeTags.filter((existing) => existing !== tag)
        setActiveTags(next)
        setAnswers((current) => {
            const stillVisible = evaluateVisibility({
                questions,
                answers: current,
                roleTags: next
            })
            const kept: AnswerMap = {}
            for (const [key, value] of Object.entries(current)) {
                if (stillVisible.has(Number(key))) {
                    kept[Number(key)] = value
                }
            }
            return kept
        })
    }

    const shown = ordered.filter((question) => visible.has(question.id))

    return (
        <div className="space-y-6">
            {gatingTags.length > 0 && (
                <div className="rounded-md border bg-muted/40 p-3">
                    <p className="mb-2 font-medium text-sm">Preview as</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {gatingTags.map((tag) => (
                            <div key={tag} className="flex items-center gap-2">
                                <Checkbox
                                    id={`preview-tag-${tag}`}
                                    checked={activeTags.includes(tag)}
                                    onCheckedChange={(checked) =>
                                        toggleTag(tag, checked === true)
                                    }
                                />
                                <Label
                                    htmlFor={`preview-tag-${tag}`}
                                    className="font-normal"
                                    title={
                                        SURVEY_ROLE_TAG_LABELS[tag].description
                                    }
                                >
                                    {SURVEY_ROLE_TAG_LABELS[tag].label}
                                </Label>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {shown.length === 0 ? (
                <StatusBanner variant="info">
                    Nothing to show yet. Add questions, or turn on a role above
                    to see the ones it unlocks.
                </StatusBanner>
            ) : (
                <div className="space-y-6">
                    {shown.map((question) => (
                        <QuestionInput
                            key={question.id}
                            question={question}
                            value={answers[question.id]}
                            onChange={(value) =>
                                handleAnswer(question.id, value)
                            }
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
