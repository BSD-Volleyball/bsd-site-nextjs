"use client"

import { RankingInput } from "@/components/surveys/ranking-input"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { optionsOf } from "@/lib/surveys/question-types"
import {
    type AnswerValue,
    SURVEY_LIMITS,
    type SurveyQuestionDef
} from "@/lib/surveys/types"
import { cn } from "@/lib/utils"

interface QuestionInputProps {
    question: SurveyQuestionDef
    value: AnswerValue | undefined
    onChange: (value: AnswerValue | undefined) => void
    disabled?: boolean
    error?: string
}

/**
 * One controlled input for one survey question, shared by the template
 * preview and (from Phase 2) the respondent form. It owns no state: the
 * caller holds the answer map and decides what an empty answer means.
 */
export function QuestionInput({
    question,
    value,
    onChange,
    disabled = false,
    error
}: QuestionInputProps) {
    const inputId = `survey-question-${question.id}`

    if (question.type === "section") {
        return (
            <div className="border-b pb-2">
                <h3 className="font-semibold text-lg">{question.prompt}</h3>
                {question.helpText && (
                    <p className="text-muted-foreground text-sm">
                        {question.helpText}
                    </p>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-2">
            <Label htmlFor={inputId} className="font-medium text-base">
                {question.prompt}
                {question.required && (
                    <span className="ml-1 text-destructive" aria-hidden="true">
                        *
                    </span>
                )}
            </Label>
            {question.helpText && (
                <p className="text-muted-foreground text-sm">
                    {question.helpText}
                </p>
            )}
            <AnswerControl
                question={question}
                value={value}
                onChange={onChange}
                disabled={disabled}
                inputId={inputId}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
    )
}

function AnswerControl({
    question,
    value,
    onChange,
    disabled,
    inputId
}: {
    question: SurveyQuestionDef
    value: AnswerValue | undefined
    onChange: (value: AnswerValue | undefined) => void
    disabled: boolean
    inputId: string
}) {
    const config = question.config

    if (config.type === "yes_no") {
        const current = value === true ? "yes" : value === false ? "no" : ""
        return (
            <RadioGroup
                id={inputId}
                value={current}
                onValueChange={(next) => onChange(next === "yes")}
                disabled={disabled}
                className="flex gap-6"
            >
                <div className="flex items-center gap-2">
                    <RadioGroupItem value="yes" id={`${inputId}-yes`} />
                    <Label htmlFor={`${inputId}-yes`} className="font-normal">
                        Yes
                    </Label>
                </div>
                <div className="flex items-center gap-2">
                    <RadioGroupItem value="no" id={`${inputId}-no`} />
                    <Label htmlFor={`${inputId}-no`} className="font-normal">
                        No
                    </Label>
                </div>
            </RadioGroup>
        )
    }

    if (config.type === "rating") {
        const steps: number[] = []
        for (let step = config.min; step <= config.max; step += 1) {
            steps.push(step)
        }
        return (
            <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2" id={inputId}>
                    {steps.map((step) => (
                        <button
                            key={step}
                            type="button"
                            disabled={disabled}
                            aria-pressed={value === step}
                            onClick={() =>
                                onChange(value === step ? undefined : step)
                            }
                            className={cn(
                                "h-9 w-9 rounded-md border text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
                                value === step
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "bg-background hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            {step}
                        </button>
                    ))}
                </div>
                {(config.minLabel || config.maxLabel) && (
                    <div className="flex justify-between text-muted-foreground text-xs">
                        <span>{config.minLabel ?? ""}</span>
                        <span>{config.maxLabel ?? ""}</span>
                    </div>
                )}
            </div>
        )
    }

    if (config.type === "likert" || config.type === "single_choice") {
        const options = optionsOf(config)
        return (
            <RadioGroup
                id={inputId}
                value={typeof value === "string" ? value : ""}
                onValueChange={(next) => onChange(next)}
                disabled={disabled}
                className={cn(
                    "gap-2",
                    config.type === "likert" && "sm:flex sm:flex-wrap sm:gap-6"
                )}
            >
                {options.map((option) => (
                    <div key={option.key} className="flex items-center gap-2">
                        <RadioGroupItem
                            value={option.key}
                            id={`${inputId}-${option.key}`}
                        />
                        <Label
                            htmlFor={`${inputId}-${option.key}`}
                            className="font-normal"
                        >
                            {option.label}
                        </Label>
                    </div>
                ))}
            </RadioGroup>
        )
    }

    if (config.type === "multi_choice") {
        const selected = Array.isArray(value) ? value : []
        return (
            <div className="space-y-2" id={inputId}>
                {optionsOf(config).map((option) => (
                    <div key={option.key} className="flex items-center gap-2">
                        <Checkbox
                            id={`${inputId}-${option.key}`}
                            checked={selected.includes(option.key)}
                            disabled={disabled}
                            onCheckedChange={(checked) => {
                                const next =
                                    checked === true
                                        ? [...selected, option.key]
                                        : selected.filter(
                                              (key) => key !== option.key
                                          )
                                onChange(next)
                            }}
                        />
                        <Label
                            htmlFor={`${inputId}-${option.key}`}
                            className="font-normal"
                        >
                            {option.label}
                        </Label>
                    </div>
                ))}
            </div>
        )
    }

    if (config.type === "text") {
        const maxLength = config.maxLength ?? SURVEY_LIMITS.maxTextAnswerLength
        const text = typeof value === "string" ? value : ""
        if (config.variant === "short") {
            return (
                <Input
                    id={inputId}
                    value={text}
                    maxLength={maxLength}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.value)}
                />
            )
        }
        return (
            <Textarea
                id={inputId}
                value={text}
                maxLength={maxLength}
                rows={4}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
            />
        )
    }

    if (config.type === "ranking") {
        return (
            <RankingInput
                options={optionsOf(config)}
                value={Array.isArray(value) ? value : undefined}
                onChange={(next) => onChange(next)}
                disabled={disabled}
            />
        )
    }

    return null
}
