"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { compressImageForUpload } from "@/lib/image-compression"
import {
    createScoreSheetUpload,
    deleteScoreSheet,
    type DivisionMatchGroup,
    finalizeScoreSheetUpload,
    getMatchesForDate,
    type MatchDateOption,
    type MatchScoreInput,
    type ScoreSheetData,
    saveScoresForDivision
} from "./actions"
import { DivisionScoreCard } from "./division-score-card"
import {
    initFormState,
    isMatchEmpty,
    type MatchFormState,
    parseIntOrNull
} from "./match-form-state"
import {
    computeResolvedMatches,
    emptyResolved,
    type ResolvedMatchInfo
} from "./match-resolution"
import {
    isSupportedImageFile,
    type ValidationWarning,
    validateMatch
} from "./match-validation"
import { ScoreSheetImageViewer } from "./score-sheet-image-viewer"

interface EnterScoresClientProps {
    matchDates: MatchDateOption[]
    defaultDate: string
    initialDivisions: DivisionMatchGroup[]
    initialScoreSheets: ScoreSheetData[]
    picBaseUrl: string
}

export function EnterScoresClient({
    matchDates,
    defaultDate,
    initialDivisions,
    initialScoreSheets,
    picBaseUrl
}: EnterScoresClientProps) {
    const [selectedDate, setSelectedDate] = useState(defaultDate)
    const [divisionGroups, setDivisionGroups] =
        useState<DivisionMatchGroup[]>(initialDivisions)
    const [scoreSheetsList, setScoreSheetsList] =
        useState<ScoreSheetData[]>(initialScoreSheets)
    const [formStates, setFormStates] = useState<
        Record<number, MatchFormState>
    >(() => {
        const initial: Record<number, MatchFormState> = {}
        for (const div of initialDivisions) {
            for (const m of div.matches) {
                initial[m.matchId] = initFormState(m)
            }
        }
        return initial
    })
    const [warnings, setWarnings] = useState<ValidationWarning[]>([])
    const [loadingDate, setLoadingDate] = useState(false)
    const [savingDivision, setSavingDivision] = useState<number | null>(null)
    const [uploadingDivision, setUploadingDivision] = useState<number | null>(
        null
    )
    const [viewingImage, setViewingImage] = useState<string | null>(null)

    const cameraInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
    const uploadInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

    // Per-division resolved match info, recomputed live from form state so
    // TBD playoff slots fill in as soon as the user picks a winner for an
    // earlier match on the same page.
    const resolvedByMatchId = useMemo(() => {
        const out = new Map<number, ResolvedMatchInfo>()
        for (const div of divisionGroups) {
            const divResolved = computeResolvedMatches(div, formStates)
            for (const [matchId, info] of divResolved) {
                out.set(matchId, info)
            }
        }
        return out
    }, [divisionGroups, formStates])

    // When a TBD match's effective teams change (e.g. user switched the
    // winner of a prerequisite), clear any entered scores for the dependent
    // match — they were tied to the previously-resolved opponent.
    const prevResolvedRef = useRef<
        Map<number, { home: number | null; away: number | null }>
    >(new Map())
    useEffect(() => {
        const prev = prevResolvedRef.current
        const next = new Map<
            number,
            { home: number | null; away: number | null }
        >()
        const toClear: number[] = []
        for (const [matchId, info] of resolvedByMatchId) {
            next.set(matchId, {
                home: info.homeTeamId,
                away: info.awayTeamId
            })
            const last = prev.get(matchId)
            if (
                last &&
                (last.home !== info.homeTeamId || last.away !== info.awayTeamId)
            ) {
                // Only clear when this match's slot was previously resolved
                // and the resolved teams have shifted. A first-time
                // null→teamId transition shouldn't clear (no stale data).
                if (last.home !== null || last.away !== null) {
                    toClear.push(matchId)
                }
            }
        }
        prevResolvedRef.current = next

        if (toClear.length > 0) {
            setFormStates((prevStates) => {
                let mutated = false
                const updated = { ...prevStates }
                for (const matchId of toClear) {
                    const current = updated[matchId]
                    if (!current || isMatchEmpty(current)) continue
                    updated[matchId] = {
                        homeScore: "",
                        awayScore: "",
                        homeSet1Score: "",
                        awaySet1Score: "",
                        homeSet2Score: "",
                        awaySet2Score: "",
                        homeSet3Score: "",
                        awaySet3Score: "",
                        winner: null
                    }
                    mutated = true
                }
                return mutated ? updated : prevStates
            })
        }
    }, [resolvedByMatchId])

    const maxSourceUploadBytes = 25 * 1024 * 1024

    const handleDateChange = async (date: string) => {
        setSelectedDate(date)
        setLoadingDate(true)
        setWarnings([])
        try {
            const result = await getMatchesForDate(date)
            if (!result.status) {
                toast.error(result.message ?? "Failed to load matches.")
                return
            }
            setDivisionGroups(result.divisions)
            setScoreSheetsList(result.scoreSheets)
            const newStates: Record<number, MatchFormState> = {}
            for (const div of result.divisions) {
                for (const m of div.matches) {
                    newStates[m.matchId] = initFormState(m)
                }
            }
            setFormStates(newStates)
        } catch {
            toast.error("Failed to load matches.")
        } finally {
            setLoadingDate(false)
        }
    }

    const updateFormField = (
        matchId: number,
        field: keyof MatchFormState,
        value: string | number | null
    ) => {
        setFormStates((prev) => ({
            ...prev,
            [matchId]: {
                ...prev[matchId],
                [field]: value
            }
        }))
    }

    const selectWinner = (matchId: number, teamId: number | null) => {
        setFormStates((prev) => {
            const current = prev[matchId]
            if (!current) return prev
            // Toggle off if already selected
            const newWinner = current.winner === teamId ? null : teamId
            return {
                ...prev,
                [matchId]: { ...current, winner: newWinner }
            }
        })
    }

    const handleSaveDivision = async (division: DivisionMatchGroup) => {
        setSavingDivision(division.divisionId)

        // Run validation
        const newWarnings: ValidationWarning[] = []
        const matchInputs: MatchScoreInput[] = []

        for (const match of division.matches) {
            const form = formStates[match.matchId]
            if (!form) continue

            const resolved =
                resolvedByMatchId.get(match.matchId) ?? emptyResolved(match)

            // Locked matches with no entered data: skip silently — the user
            // hasn't had a chance to fill them out yet because their teams
            // aren't determined.
            if (resolved.isLocked && isMatchEmpty(form)) {
                continue
            }

            const matchWarnings = validateMatch(form, resolved)
            if (matchWarnings.length > 0) {
                newWarnings.push({
                    matchId: match.matchId,
                    messages: matchWarnings
                })
            }

            matchInputs.push({
                matchId: match.matchId,
                homeScore: parseIntOrNull(form.homeScore),
                awayScore: parseIntOrNull(form.awayScore),
                homeSet1Score: parseIntOrNull(form.homeSet1Score),
                awaySet1Score: parseIntOrNull(form.awaySet1Score),
                homeSet2Score: parseIntOrNull(form.homeSet2Score),
                awaySet2Score: parseIntOrNull(form.awaySet2Score),
                homeSet3Score: parseIntOrNull(form.homeSet3Score),
                awaySet3Score: parseIntOrNull(form.awaySet3Score),
                winner: form.winner
            })
        }

        // Update warnings for this division
        setWarnings((prev) => {
            const otherDivisionWarnings = prev.filter(
                (w) => !division.matches.some((m) => m.matchId === w.matchId)
            )
            return [...otherDivisionWarnings, ...newWarnings]
        })

        if (newWarnings.length > 0) {
            toast.error(
                "Cannot save — fix errors in highlighted matches first."
            )
            setSavingDivision(null)
            return
        }

        try {
            const result = await saveScoresForDivision(
                division.divisionId,
                selectedDate,
                matchInputs
            )
            if (!result.status) {
                toast.error(result.message)
            } else {
                toast.success(result.message)
            }
        } catch {
            toast.error("Failed to save scores.")
        } finally {
            setSavingDivision(null)
        }
    }

    const handleFileSelected = async (divisionId: number, file: File) => {
        if (uploadingDivision) return

        if (!isSupportedImageFile(file)) {
            toast.error("Only image files are supported.")
            return
        }

        if (file.size > maxSourceUploadBytes) {
            toast.error("Image must be 25MB or smaller before compression.")
            return
        }

        setUploadingDivision(divisionId)

        try {
            let processedImage: { blob: Blob }
            try {
                processedImage = await compressImageForUpload(file)
            } catch {
                toast.error(
                    "Could not process that image. Please try another photo."
                )
                return
            }

            const uploadStart = await createScoreSheetUpload(
                divisionId,
                selectedDate,
                processedImage.blob.size
            )
            if (
                !uploadStart.status ||
                !uploadStart.uploadUrl ||
                !uploadStart.objectKey
            ) {
                toast.error(uploadStart.message ?? "Failed to start upload.")
                return
            }

            const uploadResponse = await fetch(uploadStart.uploadUrl, {
                method: "PUT",
                headers: {
                    "Content-Type": "image/jpeg",
                    "Content-Length": String(processedImage.blob.size)
                },
                body: processedImage.blob
            })

            if (!uploadResponse.ok) {
                toast.error("Upload to storage failed. Please try again.")
                return
            }

            const finalizeResult = await finalizeScoreSheetUpload(
                divisionId,
                selectedDate,
                uploadStart.objectKey
            )

            if (!finalizeResult.status) {
                toast.error(finalizeResult.message)
                return
            }

            if (finalizeResult.scoreSheet) {
                setScoreSheetsList((prev) => [
                    ...prev,
                    finalizeResult.scoreSheet!
                ])
            }

            toast.success("Score sheet uploaded.")
        } finally {
            clearFileInput(divisionId)
            setUploadingDivision(null)
        }
    }

    const handleDeleteScoreSheet = async (sheetId: number) => {
        try {
            const result = await deleteScoreSheet(sheetId)
            if (!result.status) {
                toast.error(result.message)
                return
            }
            setScoreSheetsList((prev) => prev.filter((s) => s.id !== sheetId))
            toast.success("Score sheet deleted.")
        } catch {
            toast.error("Failed to delete score sheet.")
        }
    }

    const clearFileInput = (divisionId: number) => {
        const camera = cameraInputRefs.current[divisionId]
        const upload = uploadInputRefs.current[divisionId]
        if (camera) camera.value = ""
        if (upload) upload.value = ""
    }

    const getImageUrl = (imagePath: string) => {
        if (!picBaseUrl) return ""
        const base = picBaseUrl.endsWith("/")
            ? picBaseUrl.slice(0, -1)
            : picBaseUrl
        return `${base}/${imagePath}`
    }

    const warningsByMatch = new Map<number, string[]>()
    for (const w of warnings) {
        warningsByMatch.set(w.matchId, w.messages)
    }

    if (matchDates.length === 0) {
        return (
            <div className="rounded-md bg-muted p-6 text-center text-muted-foreground">
                No match dates found for the current season.
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Date Selector */}
            <div className="flex items-center gap-3">
                <label
                    htmlFor="match-date"
                    className="whitespace-nowrap font-medium text-sm"
                >
                    Match Date:
                </label>
                <Select value={selectedDate} onValueChange={handleDateChange}>
                    <SelectTrigger className="w-56">
                        <SelectValue placeholder="Select a date" />
                    </SelectTrigger>
                    <SelectContent>
                        {matchDates.map((d) => (
                            <SelectItem key={d.date} value={d.date}>
                                {d.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {loadingDate ? (
                <div className="rounded-md bg-muted p-6 text-center text-muted-foreground">
                    Loading matches...
                </div>
            ) : divisionGroups.length === 0 ? (
                <div className="rounded-md bg-muted p-6 text-center text-muted-foreground">
                    No matches found for this date.
                </div>
            ) : (
                <div className="space-y-8">
                    {divisionGroups.map((division) => (
                        <DivisionScoreCard
                            key={division.divisionId}
                            division={division}
                            scoreSheetsList={scoreSheetsList}
                            uploadingDivision={uploadingDivision}
                            savingDivision={savingDivision}
                            formStates={formStates}
                            warningsByMatch={warningsByMatch}
                            resolvedByMatchId={resolvedByMatchId}
                            cameraInputRefs={cameraInputRefs}
                            uploadInputRefs={uploadInputRefs}
                            handleFileSelected={handleFileSelected}
                            handleDeleteScoreSheet={handleDeleteScoreSheet}
                            handleSaveDivision={handleSaveDivision}
                            updateFormField={updateFormField}
                            selectWinner={selectWinner}
                            setViewingImage={setViewingImage}
                            getImageUrl={getImageUrl}
                        />
                    ))}
                </div>
            )}

            {/* Full-screen image viewer */}
            {viewingImage && (
                <ScoreSheetImageViewer
                    imageUrl={viewingImage}
                    onClose={() => setViewingImage(null)}
                />
            )}
        </div>
    )
}
