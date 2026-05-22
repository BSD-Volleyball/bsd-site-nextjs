"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { compressImageForUpload } from "@/lib/image-compression"
import { buildPlayerPictureUrl } from "@/lib/utils"
import {
    createTeamPhotoUpload,
    finalizeTeamPhotoUpload,
    type DivisionTeamGroup
} from "./actions"

// Reject before doing any work — compression also enforces this server-side.
function isSupportedImageFile(file: File): boolean {
    return file.type.startsWith("image/")
}

const maxSourceUploadBytes = 25 * 1024 * 1024

interface AddTeamPicturesClientProps {
    divisions: DivisionTeamGroup[]
    picBaseUrl: string
}

export function AddTeamPicturesClient({
    divisions,
    picBaseUrl
}: AddTeamPicturesClientProps) {
    const [uploadingTeamId, setUploadingTeamId] = useState<number | null>(null)
    // Local object-URL previews keyed by teamId. Because the R2 key is
    // deterministic, a replacement reuses the same URL — showing the freshly
    // uploaded blob avoids a stale-cache flicker on the thumbnail.
    const [previewByTeam, setPreviewByTeam] = useState<Record<number, string>>(
        {}
    )

    const cameraInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
    const uploadInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
    // Every preview URL we create, tracked in a ref so the unmount cleanup can
    // revoke them without depending on (and re-running for) preview state.
    const createdObjectUrls = useRef<string[]>([])

    // Revoke any object URLs created for previews when the component unmounts.
    useEffect(() => {
        return () => {
            for (const url of createdObjectUrls.current) {
                URL.revokeObjectURL(url)
            }
        }
    }, [])

    const clearFileInput = (teamId: number) => {
        const camera = cameraInputRefs.current[teamId]
        const upload = uploadInputRefs.current[teamId]
        if (camera) camera.value = ""
        if (upload) upload.value = ""
    }

    const handleFileSelected = async (teamId: number, file: File) => {
        if (uploadingTeamId) return

        if (!isSupportedImageFile(file)) {
            toast.error("Only image files are supported.")
            return
        }

        if (file.size > maxSourceUploadBytes) {
            toast.error("Image must be 25MB or smaller before compression.")
            return
        }

        setUploadingTeamId(teamId)

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

            const uploadStart = await createTeamPhotoUpload(
                teamId,
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

            const finalizeResult = await finalizeTeamPhotoUpload(
                teamId,
                uploadStart.objectKey
            )

            if (!finalizeResult.status) {
                toast.error(finalizeResult.message)
                return
            }

            const previewUrl = URL.createObjectURL(processedImage.blob)
            createdObjectUrls.current.push(previewUrl)
            setPreviewByTeam((prev) => {
                const existing = prev[teamId]
                if (existing) URL.revokeObjectURL(existing)
                return { ...prev, [teamId]: previewUrl }
            })

            toast.success("Team photo uploaded.")
        } finally {
            clearFileInput(teamId)
            setUploadingTeamId(null)
        }
    }

    if (divisions.length === 0) {
        return (
            <div className="rounded-md bg-muted p-6 text-center text-muted-foreground">
                No teams found for the current season.
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {divisions.map((division) => (
                <div key={division.divisionId} className="rounded-lg border">
                    <div className="border-b bg-muted/50 px-4 py-3">
                        <h2 className="font-semibold text-lg">
                            Division {division.divisionName}
                        </h2>
                    </div>

                    <div className="space-y-3 p-4">
                        {division.teams.map((team) => {
                            const isTeamUploading =
                                uploadingTeamId === team.teamId
                            const photoUrl =
                                previewByTeam[team.teamId] ??
                                buildPlayerPictureUrl(
                                    picBaseUrl,
                                    team.pictureUrl
                                )
                            const hasPhoto = !!photoUrl

                            return (
                                <div
                                    key={team.teamId}
                                    className="flex items-center gap-3 rounded-md border p-3"
                                >
                                    {hasPhoto ? (
                                        <img
                                            src={photoUrl}
                                            alt={`${team.teamName} team`}
                                            className="h-16 w-16 shrink-0 rounded-md border object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs">
                                            No photo
                                        </div>
                                    )}

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium text-sm">
                                            {team.teamNumber != null
                                                ? `#${team.teamNumber} `
                                                : ""}
                                            {team.teamName}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            {hasPhoto
                                                ? "Photo uploaded"
                                                : "No photo yet"}
                                        </p>
                                    </div>

                                    <input
                                        ref={(node) => {
                                            cameraInputRefs.current[
                                                team.teamId
                                            ] = node
                                        }}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        disabled={!!uploadingTeamId}
                                        onChange={(event) => {
                                            const file = event.target.files?.[0]
                                            if (!file) return
                                            void handleFileSelected(
                                                team.teamId,
                                                file
                                            )
                                        }}
                                    />

                                    <input
                                        ref={(node) => {
                                            uploadInputRefs.current[
                                                team.teamId
                                            ] = node
                                        }}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        disabled={!!uploadingTeamId}
                                        onChange={(event) => {
                                            const file = event.target.files?.[0]
                                            if (!file) return
                                            void handleFileSelected(
                                                team.teamId,
                                                file
                                            )
                                        }}
                                    />

                                    <div className="flex shrink-0 flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={!!uploadingTeamId}
                                            onClick={() =>
                                                cameraInputRefs.current[
                                                    team.teamId
                                                ]?.click()
                                            }
                                        >
                                            {isTeamUploading
                                                ? "Uploading..."
                                                : "Take Photo"}
                                        </Button>

                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={!!uploadingTeamId}
                                            onClick={() =>
                                                uploadInputRefs.current[
                                                    team.teamId
                                                ]?.click()
                                            }
                                        >
                                            {isTeamUploading
                                                ? "Uploading..."
                                                : "Upload Photo"}
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
