"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type {
    MergeAccountSnapshot,
    MergeCandidates,
    UserOption
} from "./actions"
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
    otherChoice
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
    aValue: unknown
    bValue: unknown
}

/** The account facts that are the same on both steps. */
function AccountFacts({ snap }: { snap: MergeAccountSnapshot }) {
    return (
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
    )
}

export function MergeUsersForm({
    users,
    initialUserAId = "",
    initialUserBId = ""
}: {
    users: UserOption[]
    initialUserAId?: string
    initialUserBId?: string
}) {
    const [userAId, setUserAId] = useState<string>(initialUserAId)
    const [userBId, setUserBId] = useState<string>(initialUserBId)
    const [candidates, setCandidates] = useState<MergeCandidates | null>(null)
    const [selection, setSelection] = useState<MergeSelection>({})
    // Arriving with both ids already chosen means another screen did step 1 on
    // the admin's behalf, so land on the field comparison rather than on a form
    // that is already filled in. "Back" still returns to the pickers.
    const handedOffPair =
        Boolean(initialUserAId) &&
        Boolean(initialUserBId) &&
        initialUserAId !== initialUserBId
    const [onFieldsStep, setOnFieldsStep] = useState(handedOffPair)
    const [isLoading, setIsLoading] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showIdentical, setShowIdentical] = useState(false)
    const [result, setResult] = useState<{
        status: boolean
        message: string
    } | null>(null)

    // Load both accounts as soon as two distinct people are picked, so step 1
    // can show what each one brings before the admin commits to comparing.
    // The counter discards responses for a pair that has since changed.
    const requestRef = useRef(0)
    useEffect(() => {
        if (!userAId || !userBId || userAId === userBId) {
            setCandidates(null)
            setSelection({})
            return
        }

        const requestId = ++requestRef.current
        setIsLoading(true)
        setResult(null)

        getMergeCandidateDetails(userAId, userBId).then((response) => {
            if (requestRef.current !== requestId) {
                return
            }
            setIsLoading(false)

            if (!response.status || !response.data) {
                setCandidates(null)
                setResult({
                    status: false,
                    message:
                        response.message ?? "Could not load those accounts."
                })
                return
            }

            setCandidates(response.data)
            setSelection(response.data.defaults)
        })
    }, [userAId, userBId])

    // The email choice decides which record survives -- logins belong to an
    // account, not to an address, so keeping the account that owns the chosen
    // address is what keeps the person able to sign in.
    const survivorSide: MergeChoice = selection.email ?? "a"
    const deletedSide = otherChoice(survivorSide)

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
                const aValue = candidates.userA.fields[field.key]
                const bValue = candidates.userB.fields[field.key]

                const bothEmpty =
                    isEmptyFieldValue(aValue) && isEmptyFieldValue(bValue)
                const same =
                    aValue instanceof Date && bValue instanceof Date
                        ? aValue.getTime() === bValue.getTime()
                        : aValue === bValue

                if (bothEmpty || same) {
                    identical += 1
                    continue
                }
                rows.push({ field, aValue, bValue })
            }
            if (rows.length > 0) {
                groups.push({ title: group.title, rows })
            }
        }

        return { differing: groups, identicalCount: identical }
    }, [candidates])

    const survivorSnap: MergeAccountSnapshot | null = candidates
        ? survivorSide === "a"
            ? candidates.userA
            : candidates.userB
        : null
    const deletedSnap: MergeAccountSnapshot | null = candidates
        ? survivorSide === "a"
            ? candidates.userB
            : candidates.userA
        : null

    const identitySplit =
        selection.old_id !== undefined &&
        selection.picture !== undefined &&
        selection.old_id !== selection.picture

    // Keeping an address whose account has no login attached, while the other
    // one does, hands this person an account they cannot sign in to.
    const lockout =
        survivorSnap !== null &&
        deletedSnap !== null &&
        survivorSnap.activity.loginMethods.length === 0 &&
        deletedSnap.activity.loginMethods.length > 0

    const takenFromDeleted = useMemo(() => {
        return differing
            .flatMap((g) => g.rows)
            .filter((r) => selection[r.field.key] === deletedSide)
    }, [differing, selection, deletedSide])

    const handleBack = () => {
        setOnFieldsStep(false)
        setShowIdentical(false)
    }

    const handleReset = () => {
        if (candidates) {
            setSelection(candidates.defaults)
        }
    }

    const choose = (key: keyof MergeSelection, choice: MergeChoice) => {
        setSelection((prev) => ({ ...prev, [key]: choice }))
    }

    const handleConfirm = async () => {
        setIsSubmitting(true)
        setResult(null)

        const response = await mergeUsers(userAId, userBId, selection)
        setResult({
            status: response.status,
            message: response.message ?? ""
        })
        setIsSubmitting(false)
        setShowConfirm(false)

        if (response.status) {
            setUserAId("")
            setUserBId("")
            setCandidates(null)
            setSelection({})
            setOnFieldsStep(false)
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

    // Handed a pair by another screen: the comparison is what was asked for, so
    // wait for it rather than flashing the picker form on the way through.
    if (onFieldsStep && !candidates && isLoading) {
        return (
            <Card className="max-w-2xl">
                <CardContent className="py-10 text-center text-muted-foreground text-sm">
                    Loading both accounts...
                </CardContent>
            </Card>
        )
    }

    // ---------------------------------------------------------------- step 1
    if (!onFieldsStep || !candidates || !survivorSnap || !deletedSnap) {
        const sameUser = Boolean(userAId) && userAId === userBId

        return (
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>Step 1 &mdash; Pick the Two Accounts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <p className="text-muted-foreground text-sm">
                        Order does not matter. You decide what the merged
                        account keeps &mdash; including which email address and
                        login it ends up with &mdash; in the next step.
                    </p>

                    <div className="grid gap-6 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label className="font-medium text-sm">
                                Player A
                            </label>
                            <UserEmailCombobox
                                users={users}
                                value={userAId}
                                onChange={setUserAId}
                                placeholder="Select a player..."
                            />
                            {candidates && (
                                <AccountFacts snap={candidates.userA} />
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="font-medium text-sm">
                                Player B
                            </label>
                            <UserEmailCombobox
                                users={users}
                                value={userBId}
                                onChange={setUserBId}
                                placeholder="Select a player..."
                            />
                            {candidates && (
                                <AccountFacts snap={candidates.userB} />
                            )}
                        </div>
                    </div>

                    {sameUser && (
                        <p className="text-red-700 text-sm dark:text-red-300">
                            Pick two different people.
                        </p>
                    )}

                    <Button
                        onClick={() => setOnFieldsStep(true)}
                        disabled={!candidates || isLoading}
                    >
                        {isLoading ? "Loading..." : "Compare Accounts"}
                    </Button>

                    {statusBanner}
                </CardContent>
            </Card>
        )
    }

    // ---------------------------------------------------------------- step 2
    const columnHeader = (
        snap: MergeAccountSnapshot,
        side: MergeChoice,
        label: string
    ) => {
        const survives = side === survivorSide
        return (
            <div
                className={`rounded-md p-3 ${
                    survives
                        ? "bg-green-50 dark:bg-green-950"
                        : "bg-red-50 dark:bg-red-950"
                }`}
            >
                <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">
                        {label}: {snap.displayName}
                    </p>
                    <Badge variant={survives ? "secondary" : "destructive"}>
                        {survives ? "Record kept" : "Record deleted"}
                    </Badge>
                </div>
                <AccountFacts snap={snap} />
            </div>
        )
    }

    const survivorLogins = survivorSnap.activity.loginMethods

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
                        {columnHeader(candidates.userA, "a", "Player A")}
                        {columnHeader(candidates.userB, "b", "Player B")}
                    </div>

                    <p className="text-muted-foreground text-sm">
                        Pick the value that should survive for each field. Only
                        fields that differ between the two accounts are listed.
                        Every record on both accounts &mdash; signups, rosters,
                        ratings, availability, history &mdash; moves onto the
                        surviving account either way. Dates shown are per
                        account; individual fields are not timestamped.
                    </p>

                    <div className="rounded-md bg-blue-50 p-3 text-blue-800 text-sm dark:bg-blue-950 dark:text-blue-200">
                        The <strong>Email</strong> choice decides which record
                        survives. After the merge this person signs in as{" "}
                        <strong>{String(survivorSnap.fields.email)}</strong>{" "}
                        using{" "}
                        {survivorLogins.length > 0
                            ? survivorLogins.join(", ")
                            : "no login method"}
                        .
                    </div>

                    {lockout && (
                        <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                            The account holding{" "}
                            {String(survivorSnap.fields.email)} has no login
                            attached, while {String(deletedSnap.fields.email)}{" "}
                            has {deletedSnap.activity.loginMethods.join(", ")}.
                            Merging this way leaves this person unable to sign
                            in &mdash; pick the other email unless they are
                            switching addresses deliberately.
                        </div>
                    )}

                    {candidates.sharesTeam && (
                        <div className="rounded-md bg-amber-50 p-3 text-amber-800 text-sm dark:bg-amber-950 dark:text-amber-200">
                            These two accounts were drafted onto the same team.
                            A roster never lists one person twice, so this is
                            most likely two different people. Merge only if you
                            know otherwise.
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
                                        ({ field, aValue, bValue }) => (
                                            <div
                                                key={field.key}
                                                className="grid gap-2 p-3 sm:grid-cols-[10rem_1fr_1fr] sm:items-center"
                                            >
                                                <span className="font-medium text-sm">
                                                    {field.label}
                                                </span>
                                                {(
                                                    [
                                                        ["a", aValue],
                                                        ["b", bValue]
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
                                Record that will be DELETED
                            </p>
                            <div className="mt-2 text-red-700 text-sm dark:text-red-300">
                                <p>Name: {deletedSnap.displayName}</p>
                                <p>
                                    Email:{" "}
                                    {String(deletedSnap.fields.email ?? "")}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-md bg-green-50 p-4 dark:bg-green-950">
                            <p className="font-medium text-green-800 text-sm dark:text-green-200">
                                Record that will be KEPT
                            </p>
                            <div className="mt-2 text-green-700 text-sm dark:text-green-300">
                                <p>Name: {survivorSnap.displayName}</p>
                                <p>
                                    Email:{" "}
                                    {String(survivorSnap.fields.email ?? "")}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <p className="font-medium text-sm">
                                Values taken from the deleted account
                            </p>
                            {takenFromDeleted.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    None &mdash; the kept account&apos;s own
                                    values survive unchanged.
                                </p>
                            ) : (
                                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                                    {takenFromDeleted.map((row) => (
                                        <li key={row.field.key}>
                                            {row.field.label}:{" "}
                                            <span className="font-medium">
                                                {formatValue(
                                                    deletedSide === "a"
                                                        ? row.aValue
                                                        : row.bValue,
                                                    row.field.kind
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <p className="text-blue-800 text-sm dark:text-blue-200">
                            This person will sign in as{" "}
                            {String(survivorSnap.fields.email ?? "")} using{" "}
                            {survivorLogins.length > 0
                                ? survivorLogins.join(", ")
                                : "no login method"}
                            . Logins on the deleted account are removed with it.
                        </p>

                        {lockout && (
                            <p className="font-medium text-red-800 text-sm dark:text-red-200">
                                Warning: the kept account has no login attached
                                &mdash; this person will not be able to sign in.
                            </p>
                        )}

                        {candidates.sharesTeam && (
                            <p className="font-medium text-amber-700 text-sm dark:text-amber-300">
                                Warning: these two were drafted onto the same
                                team, so they are most likely two different
                                people.
                            </p>
                        )}

                        <p className="text-muted-foreground text-sm">
                            All records from both accounts end up on the kept
                            one, including signups, team captaincy, draft picks,
                            waitlist entries, discounts, evaluations, ratings,
                            availability, referee assignments, friendships, and
                            roles.
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
