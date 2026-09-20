"use client"

import { RiAddLine, RiDeleteBinLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { optionsOf } from "@/lib/surveys/question-types"
import {
    SURVEY_ROLE_TAG_LABELS,
    SURVEY_ROLE_TAGS,
    type SurveyAnswerCondition,
    type SurveyOption,
    type SurveyQuestionDef,
    type SurveyRoleTag,
    type SurveyVisibility
} from "@/lib/surveys/types"

interface VisibilityEditorProps {
    visibility: SurveyVisibility
    onChange: (visibility: SurveyVisibility) => void
    /**
     * The questions this one may branch on: earlier in the list, unarchived,
     * answerable, and already saved (a brand new question has no id yet for a
     * condition to point at).
     */
    candidates: SurveyQuestionDef[]
    disabled?: boolean
    idPrefix: string
}

const LIST_OPERATORS: { value: "in" | "not_in"; label: string }[] = [
    { value: "in", label: "is one of" },
    { value: "not_in", label: "is not one of" }
]

const NUMBER_OPERATORS: { value: "eq" | "gte" | "lte"; label: string }[] = [
    { value: "eq", label: "is exactly" },
    { value: "gte", label: "is at least" },
    { value: "lte", label: "is at most" }
]

type NumericCondition = Extract<SurveyAnswerCondition, { value: number }>

/** Narrows a condition to the numeric branch of the union. */
function isNumericCondition(
    condition: SurveyAnswerCondition
): condition is NumericCondition {
    return condition.operator !== "in" && condition.operator !== "not_in"
}

/** The pickable answers of a dependency: yes/no, or its option list. */
export function conditionChoices(question: SurveyQuestionDef): SurveyOption[] {
    if (question.type === "yes_no") {
        return [
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" }
        ]
    }
    return optionsOf(question.config)
}

/**
 * A well-formed starting condition for a dependency: a rating gets a numeric
 * comparison at the bottom of its scale, everything else an `in` seeded with
 * its first answer, so a freshly added rule is never unsatisfiable.
 */
export function defaultConditionFor(
    question: SurveyQuestionDef
): SurveyAnswerCondition {
    if (question.type === "rating" && question.config.type === "rating") {
        return {
            questionId: question.id,
            operator: "eq",
            value: question.config.min
        }
    }
    const first = conditionChoices(question)[0]
    return {
        questionId: question.id,
        operator: "in",
        values: first ? [first.key] : []
    }
}

/**
 * Problems the branching graph validator cannot see: a rule whose dependency
 * has dropped out of the list, and an `in`/`not_in` rule with nothing chosen
 * (which the graph accepts but no answer can ever satisfy).
 */
export function visibilityErrors(
    visibility: SurveyVisibility,
    candidates: SurveyQuestionDef[]
): string[] {
    const errors: string[] = []
    for (const condition of visibility.conditions) {
        const dependency = candidates.find(
            (candidate) => candidate.id === condition.questionId
        )
        if (!dependency) {
            errors.push(
                "A rule points at a question that no longer comes before this one."
            )
            continue
        }
        if (
            (condition.operator === "in" || condition.operator === "not_in") &&
            condition.values.length === 0
        ) {
            errors.push(
                `Choose at least one answer for the rule on "${dependency.prompt}".`
            )
        }
    }
    return errors
}

/** Conditions and role tags for one question. */
export function VisibilityEditor({
    visibility,
    onChange,
    candidates,
    disabled = false,
    idPrefix
}: VisibilityEditorProps) {
    function setConditions(conditions: SurveyAnswerCondition[]) {
        onChange({ ...visibility, conditions })
    }

    function replaceCondition(index: number, condition: SurveyAnswerCondition) {
        setConditions(
            visibility.conditions.map((existing, i) =>
                i === index ? condition : existing
            )
        )
    }

    function toggleRoleTag(tag: SurveyRoleTag, checked: boolean) {
        onChange({
            ...visibility,
            roleTags: checked
                ? [...visibility.roleTags, tag]
                : visibility.roleTags.filter((existing) => existing !== tag)
        })
    }

    return (
        <div className="space-y-4 rounded-md border bg-muted/30 p-3">
            <div className="space-y-2">
                <p className="font-medium text-sm">Show this question when</p>
                {visibility.conditions.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                        Always shown. Add a rule to branch on an earlier answer.
                    </p>
                )}

                {visibility.conditions.map((condition, index) => {
                    const dependency = candidates.find(
                        (candidate) => candidate.id === condition.questionId
                    )
                    return (
                        <ConditionRow
                            // Conditions are positional; the index is the only
                            // stable identity they have.
                            key={`${idPrefix}-condition-${index}`}
                            idPrefix={`${idPrefix}-condition-${index}`}
                            condition={condition}
                            dependency={dependency}
                            candidates={candidates}
                            disabled={disabled}
                            onChange={(next) => replaceCondition(index, next)}
                            onRemove={() =>
                                setConditions(
                                    visibility.conditions.filter(
                                        (_, i) => i !== index
                                    )
                                )
                            }
                        />
                    )
                })}

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || candidates.length === 0}
                    onClick={() =>
                        setConditions([
                            ...visibility.conditions,
                            defaultConditionFor(candidates[0])
                        ])
                    }
                >
                    <RiAddLine className="mr-1 h-4 w-4" />
                    Add rule
                </Button>
                {candidates.length === 0 && (
                    <p className="text-muted-foreground text-xs">
                        A question can only branch on a saved question that
                        comes before it.
                    </p>
                )}
            </div>

            <div className="space-y-2">
                <p className="font-medium text-sm">Only show to</p>
                <p className="text-muted-foreground text-xs">
                    Leave every box clear to show the question to everyone.
                </p>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                    {SURVEY_ROLE_TAGS.map((tag) => (
                        <div key={tag} className="flex items-center gap-2">
                            <Checkbox
                                id={`${idPrefix}-tag-${tag}`}
                                checked={visibility.roleTags.includes(tag)}
                                disabled={disabled}
                                onCheckedChange={(checked) =>
                                    toggleRoleTag(tag, checked === true)
                                }
                            />
                            <Label
                                htmlFor={`${idPrefix}-tag-${tag}`}
                                className="font-normal"
                                title={SURVEY_ROLE_TAG_LABELS[tag].description}
                            >
                                {SURVEY_ROLE_TAG_LABELS[tag].label}
                            </Label>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function ConditionRow({
    condition,
    dependency,
    candidates,
    disabled,
    onChange,
    onRemove,
    idPrefix
}: {
    condition: SurveyAnswerCondition
    dependency: SurveyQuestionDef | undefined
    candidates: SurveyQuestionDef[]
    disabled: boolean
    onChange: (condition: SurveyAnswerCondition) => void
    onRemove: () => void
    idPrefix: string
}) {
    const numeric = isNumericCondition(condition) ? condition : null
    const ratingConfig =
        dependency?.config.type === "rating" ? dependency.config : null
    const choices = dependency ? conditionChoices(dependency) : []
    const selected =
        condition.operator === "in" || condition.operator === "not_in"
            ? condition.values
            : []

    return (
        <div className="space-y-2 rounded-md border bg-background p-2">
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value={String(condition.questionId)}
                    disabled={disabled}
                    onValueChange={(value) => {
                        const next = candidates.find(
                            (candidate) => String(candidate.id) === value
                        )
                        if (next) onChange(defaultConditionFor(next))
                    }}
                >
                    <SelectTrigger
                        id={`${idPrefix}-question`}
                        className="w-full sm:w-72"
                        aria-label="Rule question"
                    >
                        <SelectValue placeholder="Choose a question" />
                    </SelectTrigger>
                    <SelectContent>
                        {candidates.map((candidate) => (
                            <SelectItem
                                key={candidate.id}
                                value={String(candidate.id)}
                            >
                                {candidate.prompt || `Question ${candidate.id}`}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {ratingConfig ? (
                    <>
                        <Select
                            value={numeric ? numeric.operator : "eq"}
                            disabled={disabled}
                            onValueChange={(value) =>
                                onChange({
                                    questionId: condition.questionId,
                                    operator: value as "eq" | "gte" | "lte",
                                    value: numeric
                                        ? numeric.value
                                        : ratingConfig.min
                                })
                            }
                        >
                            <SelectTrigger
                                id={`${idPrefix}-operator`}
                                className="w-40"
                                aria-label="Rule comparison"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {NUMBER_OPERATORS.map((operator) => (
                                    <SelectItem
                                        key={operator.value}
                                        value={operator.value}
                                    >
                                        {operator.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            id={`${idPrefix}-value`}
                            type="number"
                            className="w-24"
                            min={ratingConfig.min}
                            max={ratingConfig.max}
                            disabled={disabled}
                            aria-label="Compare to"
                            value={numeric ? numeric.value : ratingConfig.min}
                            onChange={(event) =>
                                onChange({
                                    questionId: condition.questionId,
                                    operator: numeric ? numeric.operator : "eq",
                                    value: Number(event.target.value)
                                })
                            }
                        />
                    </>
                ) : (
                    <Select
                        value={numeric ? "in" : condition.operator}
                        disabled={disabled || !dependency}
                        onValueChange={(value) =>
                            onChange({
                                questionId: condition.questionId,
                                operator: value as "in" | "not_in",
                                values: selected
                            })
                        }
                    >
                        <SelectTrigger
                            id={`${idPrefix}-operator`}
                            className="w-40"
                            aria-label="Rule comparison"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {LIST_OPERATORS.map((operator) => (
                                <SelectItem
                                    key={operator.value}
                                    value={operator.value}
                                >
                                    {operator.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label="Remove rule"
                    onClick={onRemove}
                >
                    <RiDeleteBinLine className="h-4 w-4" />
                </Button>
            </div>

            {!dependency && (
                <p className="text-destructive text-sm">
                    This rule points at a question that no longer comes before
                    this one. Remove it or move the questions.
                </p>
            )}

            {dependency && !ratingConfig && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 pl-1">
                    {choices.map((choice) => (
                        <div
                            key={choice.key}
                            className="flex items-center gap-2"
                        >
                            <Checkbox
                                id={`${idPrefix}-choice-${choice.key}`}
                                checked={selected.includes(choice.key)}
                                disabled={disabled}
                                onCheckedChange={(checked) =>
                                    onChange({
                                        questionId: condition.questionId,
                                        operator:
                                            condition.operator === "not_in"
                                                ? "not_in"
                                                : "in",
                                        values:
                                            checked === true
                                                ? [...selected, choice.key]
                                                : selected.filter(
                                                      (key) =>
                                                          key !== choice.key
                                                  )
                                    })
                                }
                            />
                            <Label
                                htmlFor={`${idPrefix}-choice-${choice.key}`}
                                className="font-normal"
                            >
                                {choice.label}
                            </Label>
                        </div>
                    ))}
                    {selected.length === 0 && (
                        <p className="w-full text-destructive text-sm">
                            Choose at least one answer.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
