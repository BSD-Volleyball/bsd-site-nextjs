"use client"

import { RiAddLine, RiDeleteBinLine, RiLockLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { generateOptionKey } from "@/lib/surveys/question-types"
import { SURVEY_LIMITS, type SurveyOption } from "@/lib/surveys/types"

interface OptionListEditorProps {
    options: SurveyOption[]
    onChange: (options: SurveyOption[]) => void
    /**
     * Keys that already carry answers. They can be relabelled but never
     * removed or reordered, which is exactly what `template-rules.ts` allows.
     */
    lockedKeys?: string[]
    /** The agreement scale: five fixed points, labels only. */
    fixed?: boolean
    disabled?: boolean
    idPrefix: string
}

/**
 * The option rows of a choice, ranking or agreement question. Option keys are
 * generated once and never shown: they are what stored answers point at, so
 * relabelling an option leaves past answers intact.
 */
export function OptionListEditor({
    options,
    onChange,
    lockedKeys = [],
    fixed = false,
    disabled = false,
    idPrefix
}: OptionListEditorProps) {
    const atMax = options.length >= SURVEY_LIMITS.maxOptions

    function relabel(key: string, label: string) {
        onChange(
            options.map((option) =>
                option.key === key ? { ...option, label } : option
            )
        )
    }

    function remove(key: string) {
        onChange(options.filter((option) => option.key !== key))
    }

    function add() {
        onChange([
            ...options,
            {
                key: generateOptionKey(),
                label: `Option ${options.length + 1}`
            }
        ])
    }

    return (
        <div className="space-y-2">
            {options.map((option, index) => {
                const locked = fixed || lockedKeys.includes(option.key)
                return (
                    <div key={option.key} className="flex items-center gap-2">
                        <span className="w-6 text-center text-muted-foreground text-sm tabular-nums">
                            {index + 1}
                        </span>
                        <Input
                            id={`${idPrefix}-option-${option.key}`}
                            value={option.label}
                            disabled={disabled}
                            aria-label={`Option ${index + 1} label`}
                            onChange={(event) =>
                                relabel(option.key, event.target.value)
                            }
                        />
                        {locked ? (
                            <span
                                className="p-2 text-muted-foreground"
                                title={
                                    fixed
                                        ? "The agreement scale keeps its five points."
                                        : "This option already has answers and cannot be removed."
                                }
                            >
                                <RiLockLine className="h-4 w-4" />
                            </span>
                        ) : (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={disabled || options.length <= 2}
                                aria-label={`Remove option ${index + 1}`}
                                onClick={() => remove(option.key)}
                            >
                                <RiDeleteBinLine className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                )
            })}

            {!fixed && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || atMax}
                    onClick={add}
                >
                    <RiAddLine className="mr-1 h-4 w-4" />
                    Add option
                </Button>
            )}
            {!fixed && atMax && (
                <p className="text-muted-foreground text-xs">
                    A question can offer at most {SURVEY_LIMITS.maxOptions}{" "}
                    options.
                </p>
            )}
        </div>
    )
}
