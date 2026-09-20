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
import type { SurveyEditorRecipient } from "@/lib/surveys/surveys"
import { SURVEY_ROLE_TAG_LABELS } from "@/lib/surveys/types"
import {
    addSurveyRecipients,
    removeSurveyRecipient,
    resendSurveyInvitations
} from "./actions"
import { formatLeagueDateTime } from "@/lib/surveys/format"

interface RecipientsTableProps {
    surveyId: number
    recipients: SurveyEditorRecipient[]
    isAnonymous: boolean
    canManage: boolean
    canResend: boolean
    users: { id: string; name: string }[]
    onChanged: () => void
}

/** Recipients table for a published survey: status badges, remove, add late, resend. */
export function RecipientsTable({
    surveyId,
    recipients,
    isAnonymous,
    canManage,
    canResend,
    users,
    onChanged
}: RecipientsTableProps) {
    const [addPick, setAddPick] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [pendingRemove, setPendingRemove] =
        useState<SurveyEditorRecipient | null>(null)

    // Only a recipient still on the list blocks re-adding. `addRecipients`
    // restores a removed row rather than inserting a second one, so someone
    // taken off by mistake has to stay pickable here.
    const activeIds = new Set(
        recipients.filter((r) => r.removedAt === null).map((r) => r.userId)
    )
    const addableUsers = users.filter((u) => !activeIds.has(u.id))

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
                                            {formatLeagueDateTime(
                                                recipient.removedAt
                                            )}
                                        </Badge>
                                    ) : recipient.submittedAt ? (
                                        // An anonymous survey's submit time is
                                        // stored at league-day midnight, but
                                        // showing even that next to a name
                                        // orders the roster by who answered
                                        // when — enough, on a small list, to
                                        // pair a person with a response. The
                                        // bare badge is all an admin needs.
                                        <Badge>
                                            {isAnonymous
                                                ? "Submitted"
                                                : `Submitted ${formatLeagueDateTime(recipient.submittedAt)}`}
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
