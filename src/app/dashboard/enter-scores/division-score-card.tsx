"use client"

import type { RefObject } from "react"
import { Button } from "@/components/ui/button"
import type {
    DivisionMatchGroup,
    MatchScoreData,
    ScoreSheetData
} from "./actions"
import type { MatchFormState } from "./match-form-state"
import { emptyResolved, type ResolvedMatchInfo } from "./match-resolution"
import { MatchScoreEntry } from "./match-score-entry"

interface DivisionScoreCardProps {
    division: DivisionMatchGroup
    scoreSheetsList: ScoreSheetData[]
    uploadingDivision: number | null
    savingDivision: number | null
    formStates: Record<number, MatchFormState>
    warningsByMatch: Map<number, string[]>
    resolvedByMatchId: Map<number, ResolvedMatchInfo>
    cameraInputRefs: RefObject<Record<number, HTMLInputElement | null>>
    uploadInputRefs: RefObject<Record<number, HTMLInputElement | null>>
    handleFileSelected: (divisionId: number, file: File) => Promise<void>
    handleDeleteScoreSheet: (sheetId: number) => Promise<void>
    handleSaveDivision: (division: DivisionMatchGroup) => Promise<void>
    updateFormField: (
        matchId: number,
        field: keyof MatchFormState,
        value: string | number | null
    ) => void
    selectWinner: (matchId: number, teamId: number | null) => void
    setViewingImage: (url: string | null) => void
    getImageUrl: (imagePath: string) => string
}

export function DivisionScoreCard({
    division,
    scoreSheetsList,
    uploadingDivision,
    savingDivision,
    formStates,
    warningsByMatch,
    resolvedByMatchId,
    cameraInputRefs,
    uploadInputRefs,
    handleFileSelected,
    handleDeleteScoreSheet,
    handleSaveDivision,
    updateFormField,
    selectWinner,
    setViewingImage,
    getImageUrl
}: DivisionScoreCardProps) {
    const divSheets = scoreSheetsList.filter(
        (s) => s.divisionId === division.divisionId
    )
    const isDivUploading = uploadingDivision === division.divisionId
    const isDivSaving = savingDivision === division.divisionId

    return (
        <div className="rounded-lg border">
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
                                cameraInputRefs.current[division.divisionId] =
                                    node
                            }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            disabled={!!uploadingDivision}
                            onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (!file) return
                                void handleFileSelected(
                                    division.divisionId,
                                    file
                                )
                            }}
                        />

                        <input
                            ref={(node) => {
                                uploadInputRefs.current[division.divisionId] =
                                    node
                            }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={!!uploadingDivision}
                            onChange={(event) => {
                                const file = event.target.files?.[0]
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
                            {isDivUploading ? "Uploading..." : "Take Photo"}
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
                            {isDivUploading ? "Uploading..." : "Upload Photo"}
                        </Button>
                    </div>

                    {/* Existing score sheets */}
                    {divSheets.length > 0 && (
                        <div className="flex flex-wrap gap-3">
                            {divSheets.map((sheet) => (
                                <div key={sheet.id} className="group relative">
                                    <button
                                        type="button"
                                        className="block overflow-hidden rounded-md border"
                                        onClick={() =>
                                            setViewingImage(
                                                getImageUrl(sheet.imagePath)
                                            )
                                        }
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={getImageUrl(sheet.imagePath)}
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
                    {division.matches.map((match: MatchScoreData) => {
                        const form = formStates[match.matchId]
                        if (!form) return null
                        const matchWarnings =
                            warningsByMatch.get(match.matchId) ?? []

                        const resolved =
                            resolvedByMatchId.get(match.matchId) ??
                            emptyResolved(match)

                        return (
                            <MatchScoreEntry
                                key={match.matchId}
                                match={match}
                                form={form}
                                warnings={matchWarnings}
                                resolved={resolved}
                                onFieldChange={(field, value) =>
                                    updateFormField(match.matchId, field, value)
                                }
                                onSelectWinner={(teamId) =>
                                    selectWinner(match.matchId, teamId)
                                }
                            />
                        )
                    })}
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                    <Button
                        onClick={() => void handleSaveDivision(division)}
                        disabled={isDivSaving || savingDivision !== null}
                    >
                        {isDivSaving
                            ? "Saving..."
                            : `Save Division ${division.divisionName}`}
                    </Button>
                </div>
            </div>
        </div>
    )
}
