"use client"

import { RiErrorWarningLine, RiMailCloseLine } from "@remixicon/react"
import { useState } from "react"
import { useAction } from "@/components/hooks/use-action"
import { NotificationPreferencesEditor } from "@/components/notifications/notification-preferences-editor"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { STREAM_LABELS, type NotificationType } from "@/lib/notifications/types"
import { reactivateStream, saveNotificationPreferences } from "./actions"

interface SuppressionView {
    streamId: string
    reason: string
    origin: string
    suppressedAt: Date
    canReactivate: boolean
}

interface NotificationsFormProps {
    initialOptedOut: NotificationType[]
    suppressions: SuppressionView[]
}

function suppressionMessage(s: SuppressionView): string {
    const label = STREAM_LABELS[s.streamId] ?? s.streamId
    if (s.reason === "HardBounce") {
        return `Delivery of ${label} previously failed for your address, so they're currently paused.`
    }
    if (s.reason === "SpamComplaint") {
        return `Your mail provider reported one of our ${label} as spam, so they're paused. This can't be undone automatically — contact info@bumpsetdrink.com if you'd like them back.`
    }
    return `You unsubscribed from ${label}, so they're currently paused.`
}

export function NotificationsForm({
    initialOptedOut,
    suppressions
}: NotificationsFormProps) {
    const [optedOut, setOptedOut] = useState<Set<NotificationType>>(
        new Set(initialOptedOut)
    )
    const [resumingStream, setResumingStream] = useState<string | null>(null)
    const { run: savePreferences, pending: isSaving } = useAction(
        saveNotificationPreferences
    )
    const { run: resume } = useAction(reactivateStream)

    const handleSave = () => {
        void savePreferences([...optedOut])
    }

    // run() never rejects, so the per-stream marker always clears.
    const handleResume = async (streamId: string) => {
        setResumingStream(streamId)
        await resume(streamId)
        setResumingStream(null)
    }

    return (
        <div className="space-y-6">
            {suppressions.length > 0 && (
                <div className="space-y-3">
                    {suppressions.map((s) => (
                        <Card
                            key={s.streamId}
                            className="border-amber-500/50 bg-amber-500/5"
                        >
                            <CardContent className="flex items-start justify-between gap-4 pt-6">
                                <div className="flex items-start gap-3">
                                    {s.reason === "SpamComplaint" ? (
                                        <RiErrorWarningLine className="mt-0.5 size-5 shrink-0 text-amber-600" />
                                    ) : (
                                        <RiMailCloseLine className="mt-0.5 size-5 shrink-0 text-amber-600" />
                                    )}
                                    <p className="text-sm">
                                        {suppressionMessage(s)}
                                    </p>
                                </div>
                                {s.canReactivate && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={resumingStream !== null}
                                        onClick={() => handleResume(s.streamId)}
                                    >
                                        {resumingStream === s.streamId
                                            ? "Resuming..."
                                            : "Resume emails"}
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <NotificationPreferencesEditor
                optedOut={optedOut}
                onChange={setOptedOut}
                disabled={isSaving}
            />

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Preferences"}
                </Button>
            </div>
        </div>
    )
}
