"use client"

import { useState } from "react"
import { toast } from "sonner"
import { UserCombobox } from "@/components/user-combobox"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { LEAGUE_TIME_ZONE } from "@/lib/date-utils"
import type { SurveyEditorRecipient } from "@/lib/surveys/surveys"
import { SURVEY_ROLE_TAG_LABELS } from "@/lib/surveys/types"
import {
    addSurveyRecipients,
    removeSurveyRecipient,
    resendSurveyInvitations
} from "./actions"

interface RecipientsTableProps {
    surveyId: number
    recipients: SurveyEditorRecipient[]
    canManage: boolean
    canResend: boolean
    users: { id: string; name: string }[]
    onChanged: () => void
}

function formatDate(date: Date | null): string {
    if (!date) return "—"
    return date.toLocaleString("en-US", {
        timeZone: LEAGUE_TIME_ZONE,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    })
}

/** Recipients table for a published survey: status badges, remove, add late, resend. */
export function RecipientsTable({
    surveyId,
    recipients,
    canManage,
    canResend,
    users,
    onChanged
}: RecipientsTableProps) {
    const [addPick, setAddPick] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [pendingRemove, setPendingRemove] =
        useState<SurveyEditorRecipient | null>(null)

    const existingIds = new Set(recipients.map((r) => r.userId))
    const addableUsers = users.filter((u) => !existingIds.has(u.id))

    async function handleAdd() {
        if (!addPick) return
        setBusy(true)
        const result = await addSurveyRecipients(surveyId, [addPick])
        setBusy(false)
        if (result.status) {
            toast.success(result.message ?? "Recipient added.")
            setAddPick(null)
            onChanged()
        } else {
            toast.error(result.message)
        }
    }

    async function handleRemove(recipient: SurveyEditorRecipient) {
        setBusy(true)
        const result = await removeSurveyRecipient(surveyId, recipient.userId)
        setBusy(false)
        if (result.status) {
            toast.success(result.message ?? "Recipient removed.")
            onChanged()
        } else {
            toast.error(result.message)
        }
    }

    async function handleResend() {
        setBusy(true)
        const result = await resendSurveyInvitations(surveyId)
        setBusy(false)
        if (result.status) {
            toast.success(
                result.message ?? `${result.data.sent} invitation(s) sent.`
            )
            onChanged()
        } else {
            toast.error(result.message)
        }
    }

    return (
        <div className="space-y-4">
            {canManage && (
                <div className="flex flex-wrap items-center gap-2">
                    <div className="w-72">
                        <UserCombobox
                            users={addableUsers}
                            value={addPick}
                            onChange={setAddPick}
                            placeholder="Add a late recipient..."
                        />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || !addPick}
                        onClick={handleAdd}
                    >
                        Add recipient
                    </Button>
                    {canResend && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={handleResend}
                        >
                            Resend invitations
                        </Button>
                    )}
                </div>
            )}

            {recipients.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    No recipients yet.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role tags</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {recipients.map((recipient) => (
                            <TableRow key={recipient.id}>
                                <TableCell>{recipient.name}</TableCell>
                                <TableCell>{recipient.email}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {recipient.roleTags.map((tag) => (
                                            <Badge key={tag} variant="outline">
                                                {SURVEY_ROLE_TAG_LABELS[tag]
                                                    ?.label ?? tag}
                                            </Badge>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {recipient.removedAt ? (
                                        <Badge variant="secondary">
                                            Removed{" "}
                                            {formatDate(recipient.removedAt)}
                                        </Badge>
                                    ) : recipient.submittedAt ? (
                                        <Badge>
                                            Submitted{" "}
                                            {formatDate(recipient.submittedAt)}
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline">Pending</Badge>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {canManage && !recipient.removedAt && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() =>
                                                setPendingRemove(recipient)
                                            }
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            <AlertDialog
                open={pendingRemove !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingRemove(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove recipient?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingRemove
                                ? `${pendingRemove.name} will no longer be able to respond to this survey.`
                                : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const target = pendingRemove
                                setPendingRemove(null)
                                if (target) void handleRemove(target)
                            }}
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
