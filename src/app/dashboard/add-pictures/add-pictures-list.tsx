"use client"

import { useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    createMissingPictureUpload,
    finalizeMissingPictureUpload,
    type MissingPicturePlayer
} from "./actions"

interface AddPicturesListProps {
    initialPlayers: MissingPicturePlayer[]
}

function isJpegFile(file: File): boolean {
    const normalizedType = file.type.toLowerCase()
    if (normalizedType === "image/jpeg" || normalizedType === "image/pjpeg") {
        return true
    }

    const normalizedName = file.name.toLowerCase()
    return normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")
}

export function AddPicturesList({ initialPlayers }: AddPicturesListProps) {
    const [players, setPlayers] = useState(initialPlayers)
    const [search, setSearch] = useState("")
    const [uploadingUserId, setUploadingUserId] = useState<string | null>(null)
    const [message, setMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

    const maxPictureUploadBytes = 5 * 1024 * 1024

    const filteredPlayers = useMemo(() => {
        if (!search.trim()) {
            return players
        }

        const normalizedQuery = search.trim().toLowerCase()
        return players.filter((player) => {
            const fullName =
                `${player.firstName} ${player.lastName}`.toLowerCase()
            const displayName = player.displayName.toLowerCase()
            const oldId = player.oldId?.toString() ?? ""
            return (
                fullName.includes(normalizedQuery) ||
                displayName.includes(normalizedQuery) ||
                oldId.includes(normalizedQuery)
            )
        })
    }, [players, search])

    const removePlayerFromList = (userId: string) => {
        setPlayers((current) =>
            current.filter((player) => player.userId !== userId)
        )
    }

    const clearFileInput = (userId: string) => {
        const input = fileInputRefs.current[userId]
        if (input) {
            input.value = ""
        }
    }

    const handleOpenCamera = (userId: string) => {
        setMessage(null)
        const input = fileInputRefs.current[userId]
        if (!input) {
            return
        }
        input.click()
    }

    const handleFileSelected = async (
        player: MissingPicturePlayer,
        file: File
    ) => {
        if (uploadingUserId) {
            return
        }

        if (!isJpegFile(file)) {
            setMessage({
                type: "error",
                text: "Only JPG files are supported."
            })
            clearFileInput(player.userId)
            return
        }

        if (file.size > maxPictureUploadBytes) {
            setMessage({
                type: "error",
                text: "Picture must be 5MB or smaller."
            })
            clearFileInput(player.userId)
            return
        }

        setUploadingUserId(player.userId)
        setMessage(null)

        try {
            const uploadStart = await createMissingPictureUpload(player.userId)
            if (
                !uploadStart.status ||
                !uploadStart.uploadUrl ||
                !uploadStart.pictureFilename
            ) {
                const uploadStartMessage =
                    uploadStart.message || "Failed to start picture upload."

                if (uploadStartMessage === "Player already has a picture.") {
                    removePlayerFromList(player.userId)
                }

                setMessage({
                    type: "error",
                    text: uploadStartMessage
                })
                return
            }

            const uploadResponse = await fetch(uploadStart.uploadUrl, {
                method: "PUT",
                headers: {
                    "Content-Type": "image/jpeg"
                },
                body: file
            })

            if (!uploadResponse.ok) {
                setMessage({
                    type: "error",
                    text: "Upload to storage failed. Please try again."
                })
                return
            }

            const finalizeResult = await finalizeMissingPictureUpload(
                player.userId,
                uploadStart.pictureFilename
            )

            if (!finalizeResult.status) {
                if (
                    finalizeResult.message === "Player already has a picture."
                ) {
                    removePlayerFromList(player.userId)
                }

                setMessage({
                    type: "error",
                    text: finalizeResult.message
                })
                return
            }

            removePlayerFromList(player.userId)
            setMessage({
                type: "success",
                text: `Uploaded picture for ${player.displayName}.`
            })
        } finally {
            clearFileInput(player.userId)
            setUploadingUserId(null)
        }
    }

    return (
        <div className="space-y-4">
            {message && (
                <div
                    className={`rounded-md p-3 text-sm ${
                        message.type === "success"
                            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                    }`}
                >
                    {message.text}
                </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="rounded-md bg-muted px-3 py-1.5 font-medium text-sm">
                    {players.length} player{players.length === 1 ? "" : "s"}{" "}
                    missing picture
                </span>
                <Input
                    placeholder="Filter by name or ID..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="max-w-sm"
                />
            </div>

            {players.length === 0 ? (
                <div className="rounded-md bg-green-50 p-6 text-center text-green-800 dark:bg-green-950 dark:text-green-200">
                    All signed-up players currently have pictures.
                </div>
            ) : filteredPlayers.length === 0 ? (
                <div className="rounded-md bg-muted p-6 text-center text-muted-foreground">
                    No matching players.
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredPlayers.map((player) => {
                        const canUpload = !!player.oldId && player.oldId > 0
                        const isRowUploading = uploadingUserId === player.userId

                        return (
                            <div
                                key={player.signupId}
                                className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="space-y-1">
                                    <p className="font-medium">
                                        {player.displayName}
                                    </p>
                                    <p className="text-muted-foreground text-sm">
                                        ID: {player.oldId ?? "missing"}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        ref={(node) => {
                                            fileInputRefs.current[
                                                player.userId
                                            ] = node
                                        }}
                                        type="file"
                                        accept="image/jpeg"
                                        capture="environment"
                                        className="hidden"
                                        disabled={
                                            !canUpload || !!uploadingUserId
                                        }
                                        onChange={(event) => {
                                            const selectedFile =
                                                event.target.files?.[0] ?? null
                                            if (!selectedFile) {
                                                return
                                            }

                                            void handleFileSelected(
                                                player,
                                                selectedFile
                                            )
                                        }}
                                    />

                                    <Button
                                        type="button"
                                        onClick={() =>
                                            handleOpenCamera(player.userId)
                                        }
                                        disabled={
                                            !canUpload ||
                                            !!uploadingUserId ||
                                            isRowUploading
                                        }
                                    >
                                        {isRowUploading
                                            ? "Uploading..."
                                            : "Add Picture"}
                                    </Button>

                                    {!canUpload && (
                                        <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-700 text-xs dark:bg-amber-900 dark:text-amber-300">
                                            Missing old_id
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
