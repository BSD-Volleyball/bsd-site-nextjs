"use client"

import { useMemo, useState } from "react"
import type { MergeCandidates, UserOption } from "./actions"
import { getMergeCandidateDetails, mergeUsers } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserEmailCombobox } from "@/components/user-combobox"
import type {
    MergeChoice,
    MergeFieldDescriptor,
    MergeSelection
} from "@/lib/merge-user-fields"
import {
    isEmptyFieldValue,
    MERGE_FIELD_GROUPS,
    resolveDefaultSelections
} from "@/lib/merge-user-fields"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog"

function formatDate(value: Date | string | null): string {
    if (!value) {
        return "—"
    }
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString()
}

/**
 * Render a column value for comparison. Booleans show Yes/No rather than a
 * blank, because "no value recorded" and "explicitly false" are different
 * decisions and the admin is choosing between them.
 */
function formatValue(value: unknown, kind: MergeFieldDescriptor["kind"]) {
    if (value === null || value === undefined) {
        return "—"
    }
    if (kind === "boolean") {
        return value ? "Yes" : "No"
    }
    if (kind === "date") {
        return formatDate(value as Date | string)
    }
    const text = String(value)
    return text.trim().length === 0 ? "—" : text
}

interface FieldRow {
    field: MergeFieldDescriptor
    oldValue: unknown
    newValue: unknown
}

export function MergeUsersForm({
    oldUsers,
    newUsers
}: {
    oldUsers: UserOption[]
    newUsers: UserOption[]
}) {
    const [oldUserId, setOldUserId] = useState<string>("")
    const [newUserId, setNewUserId] = useState<string>("")
    const [candidates, setCandidates] = useState<MergeCandidates | null>(null)
    const [selection, setSelection] = useState<MergeSelection>({})
    const [isLoading, setIsLoading] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showIdentical, setShowIdentical] = useState(false)
    const [result, setResult] = useState<{
        status: boolean
        message: string
    } | null>(null)

    const oldUser = oldUsers.find((u) => u.id === oldUserId)
    const newUser = newUsers.find((u) => u.id === newUserId)

    // Split every mergeable column into "the admin must choose" and "both
    // accounts already agree", so step 2 shows only real decisions.
    const { differing, identicalCount } = useMemo(() => {
        if (!candidates) {
            return { differing: [], identicalCount: 0 } as {
                differing: { title: string; rows: FieldRow[] }[]
                identicalCount: number
            }
        }

        const groups: { title: string; rows: FieldRow[] }[] = []
        let identical = 0

        for (const group of MERGE_FIELD_GROUPS) {
            const rows: FieldRow[] = []
            for (const field of group.fields) {
                const oldValue = candidates.oldUser.fields[field.key]
                const newValue = candidates.newUser.fields[field.key]

                const bothEmpty =
                    isEmptyFieldValue(oldValue) && isEmptyFieldValue(newValue)
                const same =
                    oldValue instanceof Date && newValue instanceof Date
                        ? oldValue.getTime() === newValue.getTime()
                        : oldValue === newValue

                if (bothEmpty || same) {
                    identical += 1
                    continue
                }
                rows.push({ field, oldValue, newValue })
            }
            if (rows.length > 0) {
                groups.push({ title: group.title, rows })
            }
        }

        return { differing: groups, identicalCount: identical }
    }, [candidates])

    const takingEmailFromOld = selection.email === "old"
    const identitySplit =
        selection.old_id !== undefined &&
        selection.picture !== undefined &&
        selection.old_id !== selection.picture

    const takenFromOld = useMemo(() => {
        return differing
            .flatMap((g) => g.rows)
            .filter((r) => selection[r.field.key] === "old")
    }, [differing, selection])

    const handleCompare = async () => {
        if (!oldUserId || !newUserId) {
            return
        }
        setIsLoading(true)
        setResult(null)

        const response = await getMergeCandidateDetails(oldUserId, newUserId)
        setIsLoading(false)

        if (!response.status || !response.data) {
            setResult({
                status: false,
                message: response.message ?? "Could not load those accounts."
            })
            return
        }

        setCandidates(response.data)
        setSelection(response.data.defaults)
    }

    const handleBack = () => {
        setCandidates(null)
        setSelection({})
        setShowIdentical(false)
    }

    const handleReset = () => {
        if (!candidates) {
            return
        }
        setSelection(
            resolveDefaultSelections(
                candidates.oldUser.fields,
                candidates.newUser.fields
            )
        )
    }

    const choose = (key: keyof MergeSelection, choice: MergeChoice) => {
        setSelection((prev) => ({ ...prev, [key]: choice }))
    }

    const handleConfirm = async () => {
        setIsSubmitting(true)
        setResult(null)

        const response = await mergeUsers(oldUserId, newUserId, selection)
        setResult({
            status: response.status,
            message: response.message ?? ""
        })
        setIsSubmitting(false)
        setShowConfirm(false)

        if (response.status) {
            setOldUserId("")
            setNewUserId("")
            setCandidates(null)
            setSelection({})
        }
    }

    const statusBanner = result && (
        <div
            className={`rounded-md p-4 ${
                result.status
                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
        >
            {result.message}
        </div>
    )

    // ---------------------------------------------------------------- step 1
    if (!candidates) {
        return (
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>Step 1 &mdash; Select Users to Merge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <label className="font-medium text-sm">
                            Old User (will be deleted)
                        </label>
                        <UserEmailCombobox
                            users={oldUsers}
                            value={oldUserId}
                            onChange={setOldUserId}
                            placeholder="Select old user..."
                        />
                        <p className="text-muted-foreground text-xs">
                            All records are transferred off this account, then
                            it is deleted. You can still keep individual field
                            values from it in the next step.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="font-medium text-sm">
                            New User (will be kept)
                        </label>
                        <UserEmailCombobox
                            users={newUsers}
                            value={newUserId}
                            onChange={setNewUserId}
                            placeholder="Select new user..."
                        />
                        <p className="text-muted-foreground text-xs">
                            This account survives the merge and inherits the old
                            account&apos;s records.
                        </p>
                    </div>

                    <Button
                        onClick={handleCompare}
                        disabled={!oldUserId || !newUserId || isLoading}
                    >
                        {isLoading ? "Loading..." : "Compare Accounts"}
                    </Button>

                    {statusBanner}
                </CardContent>
            </Card>
        )
    }

    // ---------------------------------------------------------------- step 2
    const { oldUser: oldSnap, newUser: newSnap } = candidates

    const columnHeader = (
        snap: typeof oldSnap,
        variant: "old" | "new",
        fallback: UserOption | undefined
    ) => (
        <div
            className={`rounded-md p-3 ${
                variant === "old"
                    ? "bg-red-50 dark:bg-red-950"
                    : "bg-green-50 dark:bg-green-950"
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">
                    {snap.displayName || fallback?.name}
                </p>
                <Badge
                    variant={variant === "old" ? "destructive" : "secondary"}
                >
                    {variant === "old" ? "Will be deleted" : "Kept"}
                </Badge>
            </div>
            <dl className="mt-2 space-y-0.5 text-muted-foreground text-xs">
                <div>{String(snap.fields.email ?? "—")}</div>
                <div>Created {formatDate(snap.activity.createdAt)}</div>
                <div>Updated {formatDate(snap.activity.updatedAt)}</div>
                <div>
                    {snap.activity.signupCount} signup
                    {snap.activity.signupCount === 1 ? "" : "s"}
                    {snap.activity.firstSeasonCode
                        ? ` (${snap.activity.firstSeasonCode}–${snap.activity.lastSeasonCode})`
                        : ""}
                </div>
                <div>
                    {snap.activity.teamsCaptained} team
                    {snap.activity.teamsCaptained === 1 ? "" : "s"} captained
                    {" · "}
                    {snap.activity.roleCount} role
                    {snap.activity.roleCount === 1 ? "" : "s"}
                </div>
                <div>Last login {formatDate(snap.activity.lastLoginAt)}</div>
                <div>
                    Login:{" "}
                    {snap.activity.loginMethods.length > 0
                        ? snap.activity.loginMethods.join(", ")
                        : "none"}
                </div>
            </dl>
        </div>
    )

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>
                        Step 2 &mdash; Choose What Carries Forward
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {columnHeader(oldSnap, "old", oldUser)}
                        {columnHeader(newSnap, "new", newUser)}
                    </div>

                    <p className="text-muted-foreground text-sm">
                        Pick the value that should survive for each field. Only
                        fields that differ between the two accounts are listed.
                        Dates shown are per account &mdash; individual fields
                        are not timestamped.
                    </p>

                    {takingEmailFromOld && (
                        <div className="rounded-md bg-blue-50 p-3 text-blue-800 text-sm dark:bg-blue-950 dark:text-blue-200">
                            Login methods from the deleted account will be moved
                            across so this person can still sign in with{" "}
                            {String(oldSnap.fields.email)}.
                        </div>
                    )}

                    {identitySplit && (
                        <div className="rounded-md bg-amber-50 p-3 text-amber-800 text-sm dark:bg-amber-950 dark:text-amber-200">
                            Old ID and Picture are coming from different
                            accounts. Player photo filenames are built from the
                            Old ID, so the stored picture will not match the
                            name the photo tools expect.
                        </div>
                    )}

                    {differing.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            These accounts hold identical values for every
                            mergeable field. Merging will transfer records only.
                        </p>
                    ) : (
                        differing.map((group) => (
                            <div key={group.title} className="space-y-2">
                                <h3 className="font-medium text-sm">
                                    {group.title}
                                </h3>
                                <div className="divide-y rounded-md border">
                                    {group.rows.map(
                                        ({ field, oldValue, newValue }) => (
                                            <div
                                                key={field.key}
                                                className="grid gap-2 p-3 sm:grid-cols-[10rem_1fr_1fr] sm:items-center"
                                            >
                                                <span className="font-medium text-sm">
                                                    {field.label}
                                                </span>
                                                {(
                                                    [
                                                        ["old", oldValue],
                                                        ["new", newValue]
                                                    ] as const
                                                ).map(([side, value]) => (
                                                    <label
                                                        key={side}
                                                        className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${
                                                            selection[
                                                                field.key
                                                            ] === side
                                                                ? "border-primary bg-primary/5"
                                                                : "border-transparent"
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            className="mt-1"
                                                            name={`merge-${field.key}`}
                                                            checked={
                                                                selection[
                                                                    field.key
                                                                ] === side
                                                            }
                                                            onChange={() =>
                                                                choose(
                                                                    field.key,
                                                                    side
                                                                )
                                                            }
                                                        />
                                                        <span className="break-all">
                                                            {formatValue(
                                                                value,
                                                                field.kind
                                                            )}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        ))
                    )}

                    {identicalCount > 0 && (
                        <div>
                            <button
                                type="button"
                                onClick={() => setShowIdentical(!showIdentical)}
                                className="text-muted-foreground text-xs underline"
                            >
                                {identicalCount} field
                                {identicalCount === 1 ? "" : "s"} identical on
                                both accounts
                            </button>
                            {showIdentical && (
                                <p className="mt-1 text-muted-foreground text-xs">
                                    These need no decision &mdash; both accounts
                                    hold the same value (or neither holds one).
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={handleBack}>
                            Back
                        </Button>
                        <Button variant="outline" onClick={handleReset}>
                            Reset to defaults
                        </Button>
                        <Button onClick={() => setShowConfirm(true)}>
                            Review &amp; Merge
                        </Button>
                    </div>

                    {statusBanner}
                </CardContent>
            </Card>

            <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Confirm User Merge</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. Please confirm you
                            want to merge these users.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="rounded-md bg-red-50 p-4 dark:bg-red-950">
                            <p className="font-medium text-red-800 text-sm dark:text-red-200">
                                Old User (will be DELETED)
                            </p>
                            <div className="mt-2 text-red-700 text-sm dark:text-red-300">
                                <p>Name: {oldSnap.displayName}</p>
                                <p>
                                    Email: {String(oldSnap.fields.email ?? "")}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-md bg-green-50 p-4 dark:bg-green-950">
                            <p className="font-medium text-green-800 text-sm dark:text-green-200">
                                New User (will be KEPT)
                            </p>
                            <div className="mt-2 text-green-700 text-sm dark:text-green-300">
                                <p>Name: {newSnap.displayName}</p>
                                <p>
                                    Email: {String(newSnap.fields.email ?? "")}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <p className="font-medium text-sm">
                                Values taken from the deleted account
                            </p>
                            {takenFromOld.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    None &mdash; the kept account&apos;s own
                                    values survive unchanged.
                                </p>
                            ) : (
                                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                                    {takenFromOld.map((row) => (
                                        <li key={row.field.key}>
                                            {row.field.label}:{" "}
                                            <span className="font-medium">
                                                {formatValue(
                                                    row.oldValue,
                                                    row.field.kind
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {takingEmailFromOld && (
                            <p className="text-blue-800 text-sm dark:text-blue-200">
                                Login methods from the deleted account will move
                                to the kept account.
                            </p>
                        )}

                        <p className="text-muted-foreground text-sm">
                            All records from the old user will be transferred to
                            the new user, including signups, team captaincy,
                            draft picks, waitlist entries, discounts,
                            evaluations, and commissioner roles.
                        </p>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowConfirm(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirm}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "Merging..." : "Confirm Merge"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
