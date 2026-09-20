"use client"

import {
    RiArrowDownLine,
    RiArrowUpLine,
    RiDeleteBinLine,
    RiDraggable,
    RiLockLine
} from "@remixicon/react"
import type { DragEvent } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { QUESTION_TYPE_DEFS, optionsOf } from "@/lib/surveys/question-types"
import {
    RATING_PRESETS,
    SURVEY_LIMITS,
    SURVEY_QUESTION_TYPES,
    type RatingPreset,
    type SurveyQuestionConfig,
    type SurveyQuestionDef,
    type SurveyQuestionType,
    type SurveyVisibility
} from "@/lib/surveys/types"
import { cn } from "@/lib/utils"
import { OptionListEditor } from "./option-list-editor"
import { VisibilityEditor } from "./visibility-editor"

/** One active question as the editor holds it, before it becomes a save payload. */
export interface QuestionDraft {
    /** Stable React key; unrelated to the database id. */
    key: number
    id: number | null
    type: SurveyQuestionType
    prompt: string
    helpText: string
    required: boolean
    config: SurveyQuestionConfig
    visibility: SurveyVisibility
    /** Answers already point at this question, so its shape is locked. */
    hasAnswers: boolean
    /** The option keys it had when it was loaded; those cannot be removed. */
    savedOptionKeys: string[]
}

interface QuestionEditorCardProps {
    draft: QuestionDraft
    index: number
    total: number
    candidates: SurveyQuestionDef[]
    errors: string[]
    disabled?: boolean
    onChange: (patch: Partial<QuestionDraft>) => void
    onRemove: () => void
    onMove: (delta: -1 | 1) => void
    draggingKey: number | null
    dragOverKey: number | null
    onDraggingKeyChange: (key: number | null) => void
    onDragOverKeyChange: (key: number | null) => void
    onDropOn: (key: number) => void
}

/** A whole number typed into an optional field, or undefined when it is blank. */
function optionalInt(raw: string): number | undefined {
    const trimmed = raw.trim()
    if (trimmed === "") return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

export function QuestionEditorCard({
    draft,
    index,
    total,
    candidates,
    errors,
    disabled = false,
    onChange,
    onRemove,
    onMove,
    draggingKey,
    dragOverKey,
    onDraggingKeyChange,
    onDragOverKeyChange,
    onDropOn
}: QuestionEditorCardProps) {
    const idPrefix = `question-${draft.key}`
    const locked = draft.hasAnswers
    const config = draft.config

    function setConfig(next: SurveyQuestionConfig) {
        onChange({ config: next })
    }

    function handleTypeChange(type: SurveyQuestionType) {
        if (type === draft.type) return
        onChange({ type, config: QUESTION_TYPE_DEFS[type].defaultConfig() })
    }

    function handleDragStart(event: DragEvent<HTMLElement>) {
        if (disabled) return
        onDraggingKeyChange(draft.key)
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", String(draft.key))
    }

    function handleDragEnd() {
        onDraggingKeyChange(null)
        onDragOverKeyChange(null)
    }

    return (
        <Card
            onDragOver={(event) => {
                if (disabled || draggingKey === null) return
                event.preventDefault()
                onDragOverKeyChange(draft.key)
            }}
            onDragLeave={() =>
                onDragOverKeyChange(
                    dragOverKey === draft.key ? null : dragOverKey
                )
            }
            onDrop={(event) => {
                event.preventDefault()
                onDropOn(draft.key)
                handleDragEnd()
            }}
            className={cn(
                draggingKey === draft.key && "opacity-50",
                dragOverKey === draft.key &&
                    draggingKey !== draft.key &&
                    "border-primary"
            )}
        >
            <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        aria-hidden="true"
                        draggable={!disabled}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        className={cn(
                            "text-muted-foreground",
                            disabled ? "cursor-not-allowed" : "cursor-grab"
                        )}
                    >
                        <RiDraggable className="h-5 w-5" />
                    </span>
                    <span className="font-medium text-muted-foreground text-sm tabular-nums">
                        {index + 1}
                    </span>

                    <Select
                        value={draft.type}
                        disabled={disabled || locked}
                        onValueChange={(value) =>
                            handleTypeChange(value as SurveyQuestionType)
                        }
                    >
                        <SelectTrigger
                            id={`${idPrefix}-type`}
                            className="w-56"
                            aria-label="Question type"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {SURVEY_QUESTION_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                    {QUESTION_TYPE_DEFS[type].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {locked && (
                        <Badge
                            variant="secondary"
                            title="This question already has responses, so its type, scale and existing options are locked."
                        >
                            <RiLockLine className="mr-1 h-3 w-3" />
                            Has responses
                        </Badge>
                    )}

                    <div className="ml-auto flex items-center gap-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={disabled || index === 0}
                            aria-label="Move question up"
                            onClick={() => onMove(-1)}
                        >
                            <RiArrowUpLine className="h-4 w-4" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={disabled || index === total - 1}
                            aria-label="Move question down"
                            onClick={() => onMove(1)}
                        >
                            <RiArrowDownLine className="h-4 w-4" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={disabled}
                            aria-label="Remove question"
                            onClick={onRemove}
                        >
                            <RiDeleteBinLine className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <p className="text-muted-foreground text-xs">
                    {QUESTION_TYPE_DEFS[draft.type].description}
                </p>

                <div className="space-y-2">
                    <Label htmlFor={`${idPrefix}-prompt`}>
                        {draft.type === "section" ? "Heading" : "Prompt"}
                    </Label>
                    <Input
                        id={`${idPrefix}-prompt`}
                        value={draft.prompt}
                        disabled={disabled}
                        maxLength={SURVEY_LIMITS.maxPromptLength}
                        onChange={(event) =>
                            onChange({ prompt: event.target.value })
                        }
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor={`${idPrefix}-help`}>
                        Help text (optional)
                    </Label>
                    <Textarea
                        id={`${idPrefix}-help`}
                        value={draft.helpText}
                        rows={2}
                        disabled={disabled}
                        maxLength={SURVEY_LIMITS.maxHelpLength}
                        onChange={(event) =>
                            onChange({ helpText: event.target.value })
                        }
                    />
                </div>

                {QUESTION_TYPE_DEFS[draft.type].hasAnswer && (
                    <div className="flex items-center gap-2">
                        <Switch
                            id={`${idPrefix}-required`}
                            checked={draft.required}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                                onChange({ required: checked })
                            }
                        />
                        <Label
                            htmlFor={`${idPrefix}-required`}
                            className="font-normal"
                        >
                            Required
                        </Label>
                    </div>
                )}

                {config.type === "rating" && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm">Scale</span>
                            {(
                                Object.keys(RATING_PRESETS) as RatingPreset[]
                            ).map((preset) => (
                                <Button
                                    key={preset}
                                    type="button"
                                    size="sm"
                                    variant={
                                        config.preset === preset
                                            ? "default"
                                            : "outline"
                                    }
                                    disabled={disabled || locked}
                                    onClick={() =>
                                        setConfig({
                                            type: "rating",
                                            min: RATING_PRESETS[preset].min,
                                            max: RATING_PRESETS[preset].max,
                                            minLabel:
                                                RATING_PRESETS[preset].minLabel,
                                            maxLabel:
                                                RATING_PRESETS[preset].maxLabel,
                                            preset
                                        })
                                    }
                                >
                                    {RATING_PRESETS[preset].label}
                                </Button>
                            ))}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-4">
                            <div className="space-y-1">
                                <Label htmlFor={`${idPrefix}-min`}>
                                    Lowest
                                </Label>
                                <Input
                                    id={`${idPrefix}-min`}
                                    type="number"
                                    value={config.min}
                                    disabled={disabled || locked}
                                    onChange={(event) =>
                                        setConfig({
                                            ...config,
                                            min: Number(event.target.value),
                                            preset: undefined
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`${idPrefix}-max`}>
                                    Highest
                                </Label>
                                <Input
                                    id={`${idPrefix}-max`}
                                    type="number"
                                    value={config.max}
                                    disabled={disabled || locked}
                                    onChange={(event) =>
                                        setConfig({
                                            ...config,
                                            max: Number(event.target.value),
                                            preset: undefined
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`${idPrefix}-min-label`}>
                                    Low label
                                </Label>
                                <Input
                                    id={`${idPrefix}-min-label`}
                                    value={config.minLabel ?? ""}
                                    disabled={disabled}
                                    onChange={(event) =>
                                        setConfig({
                                            ...config,
                                            minLabel:
                                                event.target.value || undefined
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`${idPrefix}-max-label`}>
                                    High label
                                </Label>
                                <Input
                                    id={`${idPrefix}-max-label`}
                                    value={config.maxLabel ?? ""}
                                    disabled={disabled}
                                    onChange={(event) =>
                                        setConfig({
                                            ...config,
                                            maxLabel:
                                                event.target.value || undefined
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </div>
                )}

                {(config.type === "likert" ||
                    config.type === "single_choice" ||
                    config.type === "multi_choice" ||
                    config.type === "ranking") && (
                    <div className="space-y-3">
                        <p className="font-medium text-sm">Options</p>
                        <OptionListEditor
                            idPrefix={idPrefix}
                            options={optionsOf(config)}
                            fixed={config.type === "likert"}
                            lockedKeys={
                                locked ? draft.savedOptionKeys : undefined
                            }
                            disabled={disabled}
                            onChange={(options) =>
                                setConfig({ ...config, options })
                            }
                        />
                    </div>
                )}

                {config.type === "multi_choice" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label htmlFor={`${idPrefix}-min-selections`}>
                                Fewest selections (optional)
                            </Label>
                            <Input
                                id={`${idPrefix}-min-selections`}
                                type="number"
                                min={0}
                                value={config.minSelections ?? ""}
                                disabled={disabled || locked}
                                onChange={(event) =>
                                    setConfig({
                                        ...config,
                                        minSelections: optionalInt(
                                            event.target.value
                                        )
                                    })
                                }
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor={`${idPrefix}-max-selections`}>
                                Most selections (optional)
                            </Label>
                            <Input
                                id={`${idPrefix}-max-selections`}
                                type="number"
                                min={1}
                                value={config.maxSelections ?? ""}
                                disabled={disabled || locked}
                                onChange={(event) =>
                                    setConfig({
                                        ...config,
                                        maxSelections: optionalInt(
                                            event.target.value
                                        )
                                    })
                                }
                            />
                        </div>
                    </div>
                )}

                {config.type === "text" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label htmlFor={`${idPrefix}-variant`}>
                                Answer size
                            </Label>
                            <Select
                                value={config.variant}
                                disabled={disabled}
                                onValueChange={(value) =>
                                    setConfig({
                                        ...config,
                                        variant: value as "short" | "long"
                                    })
                                }
                            >
                                <SelectTrigger id={`${idPrefix}-variant`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="short">
                                        One line
                                    </SelectItem>
                                    <SelectItem value="long">
                                        Paragraph
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor={`${idPrefix}-max-length`}>
                                Character limit (optional)
                            </Label>
                            <Input
                                id={`${idPrefix}-max-length`}
                                type="number"
                                min={1}
                                max={SURVEY_LIMITS.maxTextAnswerLength}
                                value={config.maxLength ?? ""}
                                disabled={disabled}
                                onChange={(event) =>
                                    setConfig({
                                        ...config,
                                        maxLength: optionalInt(
                                            event.target.value
                                        )
                                    })
                                }
                            />
                        </div>
                    </div>
                )}

                <VisibilityEditor
                    idPrefix={idPrefix}
                    visibility={draft.visibility}
                    candidates={candidates}
                    disabled={disabled}
                    onChange={(visibility) => onChange({ visibility })}
                />

                {errors.length > 0 && (
                    <ul className="space-y-1 text-destructive text-sm">
                        {errors.map((error) => (
                            <li key={error}>{error}</li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
