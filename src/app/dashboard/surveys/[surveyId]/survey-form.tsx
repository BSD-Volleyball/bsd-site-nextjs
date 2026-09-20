"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { QuestionInput } from "@/components/surveys/question-input"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { StatusBanner } from "@/components/ui/status-banner"
import { LEAGUE_TIME_ZONE } from "@/lib/date-utils"
import type { RespondentSurveyView } from "@/lib/surveys/respondent"
import type { AnswerMap, AnswerValue } from "@/lib/surveys/types"
import { validateSubmission } from "@/lib/surveys/validate-submission"
import { evaluateVisibility } from "@/lib/surveys/visibility"
import { saveSurveyDraft, submitSurveyResponse } from "../actions"

/** How long the form waits after the last change before saving the draft. */
const AUTOSAVE_DELAY_MS = 800

const FIX_ERRORS_MESSAGE =
    "Please fix the highlighted questions before submitting."

type SaveState = "idle" | "saving" | "saved" | "error"

const SAVE_LABELS: Record<SaveState, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Save failed"
}

/**
 * The respondent's copy of one survey.
 *
 * Answers live in local state and are autosaved as a whole sheet: the save
 * actions treat what is posted as the complete answer set, so a question that
 * branching just hid has its answer dropped here and disappears server-side on
 * the next save. Branching is re-evaluated on every change, which is also what
 * decides which questions are on screen at all.
 */
export function SurveyForm({ view }: { view: RespondentSurveyView }) {
    const router = useRouter()
    const { survey, questions, roleTags, canEdit } = view

    const [answers, setAnswers] = useState<AnswerMap>(view.answers)
    const [errors, setErrors] = useState<Record<number, string>>({})
    const [saveState, setSaveState] = useState<SaveState>("idle")
    const [formError, setFormError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)

    // What the next save should post, what is still unsaved, the pending
    // debounce timer, and a chain that keeps saves in order.
    const answersRef = useRef<AnswerMap>(view.answers)
    const dirtyRef = useRef(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const chainRef = useRef<Promise<void>>(Promise.resolve())

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [])

    const ordered = useMemo(
        () =>
            [...questions].sort(
                (a, b) => a.sortOrder - b.sortOrder || a.id - b.id
            ),
        [questions]
    )

    const visible = useMemo(
        () => evaluateVisibility({ questions, answers, roleTags }),
        [questions, answers, roleTags]
    )

    const save = useCallback(
        (map: AnswerMap) => {
            dirtyRef.current = false
            setSaveState("saving")
            chainRef.current = chainRef.current.then(async () => {
                try {
                    const result = await saveSurveyDraft(survey.id, map)
                    // A newer change is already queued; let its own save own
                    // the indicator rather than flashing "Saved" in between.
                    if (dirtyRef.current) return
                    setSaveState(result.status ? "saved" : "error")
                } catch {
                    setSaveState("error")
                }
            })
            return chainRef.current
        },
        [survey.id]
    )

    /** Clears the debounce and waits for every queued save to land. */
    const flushSave = useCallback(async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        if (dirtyRef.current) save(answersRef.current)
        await chainRef.current
    }, [save])

    /**
     * Stores the answer, then forgets any answer whose question the change
     * just hid — a hidden question is never read back, so one pass settles the
     * sheet the save will post.
     */
    function handleAnswer(questionId: number, value: AnswerValue | undefined) {
        if (!canEdit) return

        const next: AnswerMap = { ...answers }
        if (value === undefined) {
            delete next[questionId]
        } else {
            next[questionId] = value
        }

        const stillVisible = evaluateVisibility({
            questions,
            answers: next,
            roleTags
        })
        for (const key of Object.keys(next)) {
            if (!stillVisible.has(Number(key))) delete next[Number(key)]
        }

        setAnswers(next)
        answersRef.current = next
        setErrors((current) => {
            if (!(questionId in current)) return current
            const kept = { ...current }
            delete kept[questionId]
            return kept
        })

        dirtyRef.current = true
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            timerRef.current = null
            save(answersRef.current)
        }, AUTOSAVE_DELAY_MS)
    }

    async function runSubmit() {
        setSubmitting(true)
        setFormError(null)
        try {
            // The draft save and the submit post the same sheet; letting the
            // pending one land first keeps them from racing each other.
            await flushSave()

            const result = await submitSurveyResponse(
                survey.id,
                answersRef.current
            )
            if (!result.status) {
                setFormError(result.message)
                return
            }
            if ("submitted" in result.data) {
                setSubmitted(true)
                setSaveState("idle")
                router.refresh()
                return
            }
            // The server re-ran the same validation against its own copy of
            // the questions, so anything it found belongs inline.
            setErrors(result.data.errors)
            setFormError(FIX_ERRORS_MESSAGE)
        } catch {
            setFormError("Something went wrong. Please try again.")
        } finally {
            setSubmitting(false)
        }
    }

    function handleSubmitClick() {
        if (!canEdit || submitting) return

        const { errors: found } = validateSubmission({
            questions,
            answers,
            roleTags,
            mode: "submit"
        })
        if (Object.keys(found).length > 0) {
            setErrors(found)
            setFormError(FIX_ERRORS_MESSAGE)
            return
        }

        setErrors({})
        // An anonymous submit cuts the link back to this person, so there is
        // no coming back to edit it.
        if (survey.isAnonymous) {
            setConfirmOpen(true)
            return
        }
        void runSubmit()
    }

    if (submitted) {
        return (
            <div className="space-y-4">
                <StatusBanner variant="success">
                    Thanks — your answers are in.
                    {survey.isAnonymous
                        ? " This survey is anonymous, so your answers can no longer be changed."
                        : " You can come back and change them until the survey closes."}
                </StatusBanner>
                <Link
                    href="/dashboard/surveys"
                    className={buttonVariants({ variant: "outline" })}
                >
                    Back to my surveys
                </Link>
            </div>
        )
    }

    const shown = ordered.filter((question) => visible.has(question.id))
    const alreadySubmitted = survey.responseStatus === "submitted"

    return (
        <div className="space-y-6">
            {!canEdit && (
                <StatusBanner variant="info">{closedReason(view)}</StatusBanner>
            )}
            {canEdit && alreadySubmitted && (
                <StatusBanner variant="success">
                    You already submitted this survey. Any change you make is
                    saved and submitted again.
                </StatusBanner>
            )}
            {canEdit && survey.isAnonymous && (
                <StatusBanner variant="warning">
                    This survey is anonymous. Your answers are separated from
                    your name when you submit, which also means you cannot
                    change them afterwards.
                </StatusBanner>
            )}
            {canEdit && survey.closesAt && (
                <p className="text-muted-foreground text-sm">
                    Closes {formatClosesAt(survey.closesAt)}. Your answers save
                    as you go.
                </p>
            )}

            {shown.length === 0 ? (
                <StatusBanner variant="info">
                    This survey has no questions for you.
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
                            disabled={!canEdit || submitting}
                            error={errors[question.id]}
                        />
                    ))}
                </div>
            )}

            {formError && (
                <StatusBanner variant="error">{formError}</StatusBanner>
            )}

            <div className="flex flex-wrap items-center gap-4">
                {canEdit && shown.length > 0 && (
                    <Button
                        type="button"
                        onClick={handleSubmitClick}
                        disabled={submitting}
                    >
                        {submitting
                            ? "Submitting…"
                            : alreadySubmitted
                              ? "Submit my changes"
                              : "Submit"}
                    </Button>
                )}
                <Link
                    href="/dashboard/surveys"
                    className={buttonVariants({ variant: "outline" })}
                >
                    Back to my surveys
                </Link>
                {canEdit && saveState !== "idle" && (
                    <span
                        aria-live="polite"
                        className={
                            saveState === "error"
                                ? "text-destructive text-sm"
                                : "text-muted-foreground text-sm"
                        }
                    >
                        {SAVE_LABELS[saveState]}
                    </span>
                )}
            </div>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Submit this anonymous survey?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            You won't be able to change your answers after
                            submitting.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setConfirmOpen(false)
                                void runSubmit()
                            }}
                        >
                            Submit
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

/** Why the form is read-only: either it closed, or anonymity sealed it. */
function closedReason(view: RespondentSurveyView): string {
    const { survey } = view
    if (survey.isAnonymous && survey.responseStatus === "submitted") {
        return "You submitted this survey anonymously. Your answers were separated from your name, so they can no longer be shown or changed."
    }
    return survey.closesAt
        ? `This survey closed ${formatClosesAt(survey.closesAt)} and is no longer accepting answers.`
        : "This survey is closed and is no longer accepting answers."
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
