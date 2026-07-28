"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { NotificationPreferencesEditor } from "@/components/notifications/notification-preferences-editor"
import { Button } from "@/components/ui/button"
import { STREAM_LABELS, type NotificationType } from "@/lib/notifications/types"
import {
    getUserNotificationSettings,
    saveUserNotificationSettings
} from "./actions"

interface NotificationSettingsCardProps {
    userId: string
}

interface SuppressionView {
    streamId: string
    reason: string
    origin: string
    canReactivate: boolean
}

export function NotificationSettingsCard({
    userId
}: NotificationSettingsCardProps) {
    const [optedOut, setOptedOut] = useState<Set<NotificationType>>(new Set())
    const [suppressions, setSuppressions] = useState<SuppressionView[]>([])
    const [emailStatus, setEmailStatus] = useState<string>("valid")
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    const load = useCallback(async () => {
        setIsLoading(true)
        const result = await getUserNotificationSettings(userId)
        if (result.status) {
            setOptedOut(new Set(result.data.optedOut))
            setSuppressions(result.data.suppressions)
            setEmailStatus(result.data.emailStatus)
        } else {
            toast.error(result.message)
        }
        setIsLoading(false)
    }, [userId])

    useEffect(() => {
        void load()
    }, [load])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const result = await saveUserNotificationSettings(userId, [
                ...optedOut
            ])
            if (result.status) {
                toast.success(result.message)
            } else {
                toast.error(result.message)
            }
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return (
            <p className="text-muted-foreground text-sm">
                Loading notification settings...
            </p>
        )
    }

    return (
        <div className="space-y-4">
            {(emailStatus !== "valid" || suppressions.length > 0) && (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-4 text-sm">
                    <p className="font-medium">
                        Email delivery status: {emailStatus}
                    </p>
                    {suppressions.length > 0 && (
                        <ul className="mt-1 list-inside list-disc text-muted-foreground">
                            {suppressions.map((s) => (
                                <li key={s.streamId}>
                                    {STREAM_LABELS[s.streamId] ?? s.streamId}:{" "}
                                    {s.reason} ({s.origin})
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="mt-1 text-muted-foreground">
                        Suppressions can only be cleared by the player from
                        their own Notifications page.
                    </p>
                </div>
            )}

            <NotificationPreferencesEditor
                optedOut={optedOut}
                onChange={setOptedOut}
                disabled={isSaving}
                idPrefix="admin-notif"
            />

            <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Notification Settings"}
            </Button>
        </div>
    )
}
