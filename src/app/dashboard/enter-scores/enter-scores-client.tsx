"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import { formatMatchTime } from "@/lib/season-utils"

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

function isMatchEmpty(form: MatchFormState): boolean {
    return (
        form.winner === null &&
        form.homeScore === "" &&
        form.awayScore === "" &&
        form.homeSet1Score === "" &&
        form.awaySet1Score === "" &&
        form.homeSet2Score === "" &&
        form.awaySet2Score === "" &&
        form.homeSet3Score === "" &&
        form.awaySet3Score === ""
    )
}

function validateMatch(match: MatchScoreData, form: MatchFormState): string[] {
    if (isMatchEmpty(form)) return []

    const errors: string[] = []

    const homeGamesWon = parseIntOrNull(form.homeScore)
    const awayGamesWon = parseIntOrNull(form.awayScore)
    const set1Home = parseIntOrNull(form.homeSet1Score)
    const set1Away = parseIntOrNull(form.awaySet1Score)
    const set2Home = parseIntOrNull(form.homeSet2Score)
    const set2Away = parseIntOrNull(form.awaySet2Score)
    const set3Home = parseIntOrNull(form.homeSet3Score)
    const set3Away = parseIntOrNull(form.awaySet3Score)

    // Completeness checks
    if (form.winner === null) errors.push("Overall Winner must be selected")
    if (homeGamesWon === null) errors.push("Home Total Games Won is required")
    if (awayGamesWon === null) errors.push("Away Total Games Won is required")
    if (set1Home === null) errors.push("Game 1 Score (Home) is required")
    if (set1Away === null) errors.push("Game 1 Score (Away) is required")
    if (set2Home === null) errors.push("Game 2 Score (Home) is required")
    if (set2Away === null) errors.push("Game 2 Score (Away) is required")

    // Game 3 is required when total games played = 3
    const totalGames = (homeGamesWon ?? 0) + (awayGamesWon ?? 0)
    if (homeGamesWon !== null && awayGamesWon !== null && totalGames === 3) {
        if (set3Home === null)
            errors.push("Game 3 Score (Home) is required when total games is 3")
        if (set3Away === null)
            errors.push("Game 3 Score (Away) is required when total games is 3")
    }

    // Stop here if any fields are missing — logic checks need complete data
    if (errors.length > 0) return errors

    // Logic alignment checks (all fields guaranteed non-null at this point)
    const sets: { home: number; away: number }[] = [
        { home: set1Home!, away: set1Away! },
        { home: set2Home!, away: set2Away! }
    ]
    if (set3Home !== null && set3Away !== null) {
        sets.push({ home: set3Home, away: set3Away })
    }

    let impliedHomeWins = 0
    let impliedAwayWins = 0
    for (const set of sets) {
        if (set.home > set.away) impliedHomeWins++
        else if (set.away > set.home) impliedAwayWins++
    }

    if (homeGamesWon !== impliedHomeWins) {
        errors.push(
            `Home Total Games Won is ${homeGamesWon} but game scores show ${impliedHomeWins}`
        )
    }
    if (awayGamesWon !== impliedAwayWins) {
        errors.push(
            `Away Total Games Won is ${awayGamesWon} but game scores show ${impliedAwayWins}`
        )
    }

    if (form.winner !== null) {
        const winnerIsHome = form.winner === match.homeTeamId
        const winnerIsAway = form.winner === match.awayTeamId
        if (winnerIsHome && impliedAwayWins > impliedHomeWins) {
            errors.push(
                `${match.homeTeamName} is selected as winner but Away won more games from scores`
            )
        }
        if (winnerIsAway && impliedHomeWins > impliedAwayWins) {
            errors.push(
                `${match.awayTeamName} is selected as winner but Home won more games from scores`
            )
        }
        if (winnerIsHome && awayGamesWon! > homeGamesWon!) {
            errors.push(
                `${match.homeTeamName} is selected as winner but Away Total Games Won is higher`
            )
        }
        if (winnerIsAway && homeGamesWon! > awayGamesWon!) {
            errors.push(
                `${match.awayTeamName} is selected as winner but Home Total Games Won is higher`
            )
        }
    }

    return errors
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
                                                            className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs opacity-0 transition-opacity group-hover:opacity-100"
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
            {/* Playoff badge */}
            {isPlayoff && (
                <div className="mb-3">
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 text-xs dark:bg-purple-900 dark:text-purple-300">
                        Playoff
                    </span>
                </div>
            )}

            {/* Time and court */}
            {(match.time || match.court !== null) && (
                <div className="mb-2 flex items-center gap-3 text-muted-foreground text-sm">
                    {match.time && <span>{formatMatchTime(match.time)}</span>}
                    {match.court !== null && <span>Court {match.court}</span>}
                </div>
            )}

            {/* Score table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr>
                            {/* Row label column */}
                            <th className="w-44 pb-2 text-left font-normal text-muted-foreground">
                                Overall Winner: (select)
                            </th>
                            <th className="w-24 pb-2 text-center">
                                <button
                                    type="button"
                                    className={`w-full rounded-md px-2 py-1 font-semibold transition-colors ${
                                        form.winner === match.homeTeamId
                                            ? "bg-green-600 text-white"
                                            : form.winner === null
                                              ? "bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:hover:bg-yellow-900/60"
                                              : "bg-muted hover:bg-muted/80"
                                    }`}
                                    onClick={() =>
                                        onSelectWinner(match.homeTeamId)
                                    }
                                    title="Click to select as winner"
                                >
                                    {match.homeTeamName}
                                </button>
                            </th>
                            <th className="w-4 pb-2 text-center font-normal text-muted-foreground text-xs">
                                vs
                            </th>
                            <th className="w-24 pb-2 text-center">
                                <button
                                    type="button"
                                    className={`w-full rounded-md px-2 py-1 font-semibold transition-colors ${
                                        form.winner === match.awayTeamId
                                            ? "bg-green-600 text-white"
                                            : form.winner === null
                                              ? "bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:hover:bg-yellow-900/60"
                                              : "bg-muted hover:bg-muted/80"
                                    }`}
                                    onClick={() =>
                                        onSelectWinner(match.awayTeamId)
                                    }
                                    title="Click to select as winner"
                                >
                                    {match.awayTeamName}
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {/* Game score rows */}
                        <ScoreInputRow
                            label="Game 1 Score"
                            homeValue={form.homeSet1Score}
                            awayValue={form.awaySet1Score}
                            onHomeChange={(v) =>
                                onFieldChange("homeSet1Score", v)
                            }
                            onAwayChange={(v) =>
                                onFieldChange("awaySet1Score", v)
                            }
                        />
                        <ScoreInputRow
                            label="Game 2 Score"
                            homeValue={form.homeSet2Score}
                            awayValue={form.awaySet2Score}
                            onHomeChange={(v) =>
                                onFieldChange("homeSet2Score", v)
                            }
                            onAwayChange={(v) =>
                                onFieldChange("awaySet2Score", v)
                            }
                        />
                        <ScoreInputRow
                            label={
                                isPlayoff
                                    ? "Game 3 Score (if needed)"
                                    : "Game 3 Score"
                            }
                            homeValue={form.homeSet3Score}
                            awayValue={form.awaySet3Score}
                            onHomeChange={(v) =>
                                onFieldChange("homeSet3Score", v)
                            }
                            onAwayChange={(v) =>
                                onFieldChange("awaySet3Score", v)
                            }
                            optional={isPlayoff}
                        />

                        {/* Total games won — separated */}
                        <ScoreInputRow
                            label="Total Games Won"
                            homeValue={form.homeScore}
                            awayValue={form.awayScore}
                            onHomeChange={(v) => onFieldChange("homeScore", v)}
                            onAwayChange={(v) => onFieldChange("awayScore", v)}
                            bold
                            topBorder
                        />
                    </tbody>
                </table>
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

function ScoreInputRow({
    label,
    homeValue,
    awayValue,
    onHomeChange,
    onAwayChange,
    optional = false,
    bold = false,
    topBorder = false
}: {
    label: string
    homeValue: string
    awayValue: string
    onHomeChange: (value: string) => void
    onAwayChange: (value: string) => void
    optional?: boolean
    bold?: boolean
    topBorder?: boolean
}) {
    return (
        <tr className={topBorder ? "border-t-2" : ""}>
            <td
                className={`py-1.5 pr-3 ${bold ? "font-semibold" : "text-muted-foreground"} ${optional ? "italic" : ""}`}
            >
                {label}
            </td>
            <td className="py-1.5 text-center">
                <input
                    type="number"
                    min={0}
                    className={`h-8 w-20 rounded-md border px-2 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                        homeValue !== ""
                            ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/40"
                            : optional
                              ? "bg-background"
                              : "border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/40"
                    }`}
                    value={homeValue}
                    onChange={(e) => onHomeChange(e.target.value)}
                    placeholder={optional ? "—" : ""}
                />
            </td>
            <td className="py-1.5 text-center text-muted-foreground text-xs">
                -
            </td>
            <td className="py-1.5 text-center">
                <input
                    type="number"
                    min={0}
                    className={`h-8 w-20 rounded-md border px-2 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                        awayValue !== ""
                            ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/40"
                            : optional
                              ? "bg-background"
                              : "border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/40"
                    }`}
                    value={awayValue}
                    onChange={(e) => onAwayChange(e.target.value)}
                    placeholder={optional ? "—" : ""}
                />
            </td>
        </tr>
    )
}
