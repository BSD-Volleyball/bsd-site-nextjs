"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    getMatchesForDate,
    saveScoresForDivision,
    createScoreSheetUpload,
    finalizeScoreSheetUpload,
    deleteScoreSheet,
    type MatchDateOption,
    type DivisionMatchGroup,
    type MatchScoreData,
    type ScoreSheetData,
    type MatchScoreInput
} from "./actions"
import { compressImageForUpload } from "@/lib/image-compression"

interface EnterScoresClientProps {
    matchDates: MatchDateOption[]
    defaultDate: string
    initialDivisions: DivisionMatchGroup[]
    initialScoreSheets: ScoreSheetData[]
    picBaseUrl: string
}

interface MatchFormState {
    homeScore: string
    awayScore: string
    homeSet1Score: string
    awaySet1Score: string
    homeSet2Score: string
    awaySet2Score: string
    homeSet3Score: string
    awaySet3Score: string
    winner: number | null
}

interface ValidationWarning {
    matchId: number
    messages: string[]
}

function initFormState(match: MatchScoreData): MatchFormState {
    return {
        homeScore: match.homeScore?.toString() ?? "",
        awayScore: match.awayScore?.toString() ?? "",
        homeSet1Score: match.homeSet1Score?.toString() ?? "",
        awaySet1Score: match.awaySet1Score?.toString() ?? "",
        homeSet2Score: match.homeSet2Score?.toString() ?? "",
        awaySet2Score: match.awaySet2Score?.toString() ?? "",
        homeSet3Score: match.homeSet3Score?.toString() ?? "",
        awaySet3Score: match.awaySet3Score?.toString() ?? "",
        winner: match.winner
    }
}

function parseIntOrNull(value: string): number | null {
    const trimmed = value.trim()
    if (trimmed === "") return null
    const num = parseInt(trimmed, 10)
    return Number.isNaN(num) ? null : num
}

function validateMatch(match: MatchScoreData, form: MatchFormState): string[] {
    const warnings: string[] = []

    const sets: { home: number | null; away: number | null }[] = [
        {
            home: parseIntOrNull(form.homeSet1Score),
            away: parseIntOrNull(form.awaySet1Score)
        },
        {
            home: parseIntOrNull(form.homeSet2Score),
            away: parseIntOrNull(form.awaySet2Score)
        },
        {
            home: parseIntOrNull(form.homeSet3Score),
            away: parseIntOrNull(form.awaySet3Score)
        }
    ]

    const enteredHomeWins = parseIntOrNull(form.homeScore)
    const enteredAwayWins = parseIntOrNull(form.awayScore)

    // Count implied wins from game scores
    let impliedHomeWins = 0
    let impliedAwayWins = 0
    let gamesWithScores = 0

    for (const set of sets) {
        if (set.home !== null && set.away !== null) {
            gamesWithScores++
            if (set.home > set.away) impliedHomeWins++
            else if (set.away > set.home) impliedAwayWins++
        }
    }

    // Only validate if we have some scores entered
    if (gamesWithScores > 0) {
        // Check 1: game scores vs games won
        if (enteredHomeWins !== null && enteredHomeWins !== impliedHomeWins) {
            warnings.push(
                `Home games won: entered ${enteredHomeWins} but game scores show ${impliedHomeWins}`
            )
        }
        if (enteredAwayWins !== null && enteredAwayWins !== impliedAwayWins) {
            warnings.push(
                `Away games won: entered ${enteredAwayWins} but game scores show ${impliedAwayWins}`
            )
        }

        // Check 2: winner vs games won
        if (form.winner !== null) {
            const winnerIsHome = form.winner === match.homeTeamId
            const winnerIsAway = form.winner === match.awayTeamId
            if (winnerIsHome && impliedAwayWins > impliedHomeWins) {
                warnings.push("Selected winner is Home but Away won more games")
            }
            if (winnerIsAway && impliedHomeWins > impliedAwayWins) {
                warnings.push("Selected winner is Away but Home won more games")
            }
        }

        // Check 3: winner vs entered games won
        if (
            form.winner !== null &&
            enteredHomeWins !== null &&
            enteredAwayWins !== null
        ) {
            const winnerIsHome = form.winner === match.homeTeamId
            const winnerIsAway = form.winner === match.awayTeamId
            if (winnerIsHome && enteredAwayWins > enteredHomeWins) {
                warnings.push(
                    "Selected winner is Home but entered Away wins > Home wins"
                )
            }
            if (winnerIsAway && enteredHomeWins > enteredAwayWins) {
                warnings.push(
                    "Selected winner is Away but entered Home wins > Away wins"
                )
            }
        }
    }

    return warnings
}

function isSupportedImageFile(file: File): boolean {
    return file.type.startsWith("image/")
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

            const matchWarnings = validateMatch(match, form)
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
            toast.warning(
                "Scores saved with warnings — please review highlighted matches."
            )
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
                selectedDate
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
                headers: { "Content-Type": "image/jpeg" },
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
                    {divisionGroups.map((division) => {
                        const divSheets = scoreSheetsList.filter(
                            (s) => s.divisionId === division.divisionId
                        )
                        const isDivUploading =
                            uploadingDivision === division.divisionId
                        const isDivSaving =
                            savingDivision === division.divisionId

                        return (
                            <div
                                key={division.divisionId}
                                className="rounded-lg border"
                            >
                                {/* Division Header */}
                                <div className="border-b bg-muted/50 px-4 py-3">
                                    <h2 className="font-semibold text-lg">
                                        Division {division.divisionName}
                                    </h2>
                                </div>

                                <div className="space-y-4 p-4">
                                    {/* Score Sheet Section */}
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium text-sm">
                                                Score Sheets:
                                            </span>

                                            <input
                                                ref={(node) => {
                                                    cameraInputRefs.current[
                                                        division.divisionId
                                                    ] = node
                                                }}
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                disabled={!!uploadingDivision}
                                                onChange={(event) => {
                                                    const file =
                                                        event.target.files?.[0]
                                                    if (!file) return
                                                    void handleFileSelected(
                                                        division.divisionId,
                                                        file
                                                    )
                                                }}
                                            />

                                            <input
                                                ref={(node) => {
                                                    uploadInputRefs.current[
                                                        division.divisionId
                                                    ] = node
                                                }}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                disabled={!!uploadingDivision}
                                                onChange={(event) => {
                                                    const file =
                                                        event.target.files?.[0]
                                                    if (!file) return
                                                    void handleFileSelected(
                                                        division.divisionId,
                                                        file
                                                    )
                                                }}
                                            />

                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={!!uploadingDivision}
                                                onClick={() =>
                                                    cameraInputRefs.current[
                                                        division.divisionId
                                                    ]?.click()
                                                }
                                            >
                                                {isDivUploading
                                                    ? "Uploading..."
                                                    : "Take Photo"}
                                            </Button>

                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={!!uploadingDivision}
                                                onClick={() =>
                                                    uploadInputRefs.current[
                                                        division.divisionId
                                                    ]?.click()
                                                }
                                            >
                                                {isDivUploading
                                                    ? "Uploading..."
                                                    : "Upload Photo"}
                                            </Button>
                                        </div>

                                        {/* Existing score sheets */}
                                        {divSheets.length > 0 && (
                                            <div className="flex flex-wrap gap-3">
                                                {divSheets.map((sheet) => (
                                                    <div
                                                        key={sheet.id}
                                                        className="group relative"
                                                    >
                                                        <button
                                                            type="button"
                                                            className="block overflow-hidden rounded-md border"
                                                            onClick={() =>
                                                                setViewingImage(
                                                                    getImageUrl(
                                                                        sheet.imagePath
                                                                    )
                                                                )
                                                            }
                                                        >
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={getImageUrl(
                                                                    sheet.imagePath
                                                                )}
                                                                alt="Score sheet"
                                                                className="h-20 w-20 object-cover"
                                                            />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="-top-2 -right-2 absolute flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs opacity-0 transition-opacity group-hover:opacity-100"
                                                            onClick={() =>
                                                                void handleDeleteScoreSheet(
                                                                    sheet.id
                                                                )
                                                            }
                                                            title="Delete score sheet"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Matches */}
                                    <div className="space-y-4">
                                        {division.matches.map((match) => {
                                            const form =
                                                formStates[match.matchId]
                                            if (!form) return null
                                            const matchWarnings =
                                                warningsByMatch.get(
                                                    match.matchId
                                                ) ?? []

                                            return (
                                                <MatchScoreEntry
                                                    key={match.matchId}
                                                    match={match}
                                                    form={form}
                                                    warnings={matchWarnings}
                                                    onFieldChange={(
                                                        field,
                                                        value
                                                    ) =>
                                                        updateFormField(
                                                            match.matchId,
                                                            field,
                                                            value
                                                        )
                                                    }
                                                    onSelectWinner={(teamId) =>
                                                        selectWinner(
                                                            match.matchId,
                                                            teamId
                                                        )
                                                    }
                                                />
                                            )
                                        })}
                                    </div>

                                    {/* Save Button */}
                                    <div className="flex justify-end pt-2">
                                        <Button
                                            onClick={() =>
                                                void handleSaveDivision(
                                                    division
                                                )
                                            }
                                            disabled={
                                                isDivSaving ||
                                                savingDivision !== null
                                            }
                                        >
                                            {isDivSaving
                                                ? "Saving..."
                                                : `Save Division ${division.divisionName}`}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Full-screen image viewer */}
            {viewingImage && (
                <div
                    role="dialog"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
                    onClick={() => setViewingImage(null)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setViewingImage(null)
                    }}
                >
                    <button
                        type="button"
                        className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white text-xl hover:bg-white/40"
                        onClick={() => setViewingImage(null)}
                    >
                        ×
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={viewingImage}
                        alt="Score sheet full view"
                        className="max-h-[90vh] max-w-[90vw] rounded-md object-contain"
                    />
                </div>
            )}
        </div>
    )
}

function MatchScoreEntry({
    match,
    form,
    warnings,
    onFieldChange,
    onSelectWinner
}: {
    match: MatchScoreData
    form: MatchFormState
    warnings: string[]
    onFieldChange: (field: keyof MatchFormState, value: string) => void
    onSelectWinner: (teamId: number | null) => void
}) {
    const isPlayoff = match.playoff
    const hasWarnings = warnings.length > 0

    return (
        <div
            className={`rounded-md border p-3 ${hasWarnings ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30" : ""}`}
        >
            {/* Match Header with court number */}
            <div className="mb-3 flex items-center gap-2 text-muted-foreground text-xs">
                {match.court && <span>Court {match.court}</span>}
                {isPlayoff && (
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                        Playoff
                    </span>
                )}
            </div>

            {/* Team names with winner selection */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
                        form.winner === match.homeTeamId
                            ? "bg-green-600 text-white"
                            : "bg-muted hover:bg-muted/80"
                    }`}
                    onClick={() => onSelectWinner(match.homeTeamId)}
                    title="Click to select as winner"
                >
                    {match.homeTeamName}
                </button>
                <span className="text-muted-foreground text-sm">vs</span>
                <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
                        form.winner === match.awayTeamId
                            ? "bg-green-600 text-white"
                            : "bg-muted hover:bg-muted/80"
                    }`}
                    onClick={() => onSelectWinner(match.awayTeamId)}
                    title="Click to select as winner"
                >
                    {match.awayTeamName}
                </button>
            </div>

            {/* Game Scores */}
            <div className="space-y-2">
                <GameScoreRow
                    label="Game 1"
                    homeValue={form.homeSet1Score}
                    awayValue={form.awaySet1Score}
                    onHomeChange={(v) => onFieldChange("homeSet1Score", v)}
                    onAwayChange={(v) => onFieldChange("awaySet1Score", v)}
                />
                <GameScoreRow
                    label="Game 2"
                    homeValue={form.homeSet2Score}
                    awayValue={form.awaySet2Score}
                    onHomeChange={(v) => onFieldChange("homeSet2Score", v)}
                    onAwayChange={(v) => onFieldChange("awaySet2Score", v)}
                />
                <GameScoreRow
                    label={isPlayoff ? "Game 3 (if needed)" : "Game 3"}
                    homeValue={form.homeSet3Score}
                    awayValue={form.awaySet3Score}
                    onHomeChange={(v) => onFieldChange("homeSet3Score", v)}
                    onAwayChange={(v) => onFieldChange("awaySet3Score", v)}
                    optional={isPlayoff}
                />

                {/* Divider */}
                <div className="border-t pt-2">
                    <GameScoreRow
                        label="Games Won"
                        homeValue={form.homeScore}
                        awayValue={form.awayScore}
                        onHomeChange={(v) => onFieldChange("homeScore", v)}
                        onAwayChange={(v) => onFieldChange("awayScore", v)}
                        bold
                    />
                </div>
            </div>

            {/* Validation Warnings */}
            {hasWarnings && (
                <div className="mt-3 space-y-1">
                    {warnings.map((msg) => (
                        <p
                            key={msg}
                            className="text-amber-700 text-xs dark:text-amber-400"
                        >
                            ⚠ {msg}
                        </p>
                    ))}
                </div>
            )}
        </div>
    )
}

function GameScoreRow({
    label,
    homeValue,
    awayValue,
    onHomeChange,
    onAwayChange,
    optional = false,
    bold = false
}: {
    label: string
    homeValue: string
    awayValue: string
    onHomeChange: (value: string) => void
    onAwayChange: (value: string) => void
    optional?: boolean
    bold?: boolean
}) {
    return (
        <div className="flex items-center gap-2">
            <span
                className={`w-32 text-sm ${bold ? "font-semibold" : "text-muted-foreground"} ${optional ? "italic" : ""}`}
            >
                {label}
            </span>
            <Input
                type="number"
                min={0}
                className="h-8 w-16 text-center"
                value={homeValue}
                onChange={(e) => onHomeChange(e.target.value)}
                placeholder={optional ? "—" : ""}
            />
            <span className="text-muted-foreground text-sm">-</span>
            <Input
                type="number"
                min={0}
                className="h-8 w-16 text-center"
                value={awayValue}
                onChange={(e) => onAwayChange(e.target.value)}
                placeholder={optional ? "—" : ""}
            />
        </div>
    )
}
