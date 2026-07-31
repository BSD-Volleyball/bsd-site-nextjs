"use client"

import { RiAlertLine, RiSearchLine } from "@remixicon/react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { StatusBanner } from "@/components/ui/status-banner"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { UserEmailCombobox } from "@/components/user-combobox"
import type { LegacyAccount, MergeTarget } from "@/lib/legacy-accounts"
import { getMergeTargets, mergeLegacyAccount } from "./actions"

const PAGE_SIZE = 50

const REASON_LABEL: Record<string, string> = {
    exact: "exact name",
    nickname: "nickname",
    spacing: "spacing",
    prefix: "shortened"
}

export function LegacyAccountsPanel({
    accounts
}: {
    accounts: LegacyAccount[]
}) {
    const router = useRouter()

    // Rows disappear from local state the moment their merge succeeds, so the
    // list stays honest before the server round-trip completes.
    const [rows, setRows] = useState(accounts)
    useEffect(() => {
        setRows(accounts)
    }, [accounts])

    // Each row's chosen target, keyed by legacy id. Absent means "still on the
    // suggestion", so a suggestion is never silently overwritten by a re-render.
    const [choices, setChoices] = useState<Record<string, string>>({})
    const [targets, setTargets] = useState<MergeTarget[] | null>(null)
    const [targetsError, setTargetsError] = useState<string | null>(null)
    const [search, setSearch] = useState("")
    const [onlySuggested, setOnlySuggested] = useState(false)
    const [page, setPage] = useState(0)
    const [confirming, setConfirming] = useState<LegacyAccount | null>(null)
    const [isMerging, setIsMerging] = useState(false)
    const [result, setResult] = useState<{
        status: boolean
        message: string
    } | null>(null)

    // ~2,000 member accounts feed the picker, so they are fetched once on
    // first use rather than shipped with every page load.
    const loadTargets = useCallback(async () => {
        if (targets !== null) return
        const response = await getMergeTargets()
        if (response.status) {
            setTargets(response.data)
        } else {
            setTargetsError(
                response.message || "Failed to load member accounts."
            )
        }
    }, [targets])

    useEffect(() => {
        void loadTargets()
    }, [loadTargets])

    const targetsById = useMemo(
        () => new Map((targets ?? []).map((t) => [t.id, t])),
        [targets]
    )

    const chosenIdFor = (account: LegacyAccount) =>
        choices[account.id] ?? account.suggestion?.id ?? ""

    const chosenTargetFor = (account: LegacyAccount): MergeTarget | null => {
        const id = chosenIdFor(account)
        if (!id) return null
        return targetsById.get(id) ?? account.suggestion ?? null
    }

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return rows.filter((row) => {
            if (onlySuggested && !row.suggestion) return false
            if (!q) return true
            return (
                row.name.toLowerCase().includes(q) ||
                row.email.toLowerCase().includes(q) ||
                (row.suggestion?.name.toLowerCase().includes(q) ?? false)
            )
        })
    }, [rows, search, onlySuggested])

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const currentPage = Math.min(page, pageCount - 1)
    const visible = filtered.slice(
        currentPage * PAGE_SIZE,
        currentPage * PAGE_SIZE + PAGE_SIZE
    )

    const suggestedCount = rows.filter((r) => r.suggestion).length

    const handleConfirm = async () => {
        if (!confirming) return
        const targetId = chosenIdFor(confirming)
        if (!targetId) return

        setIsMerging(true)
        const response = await mergeLegacyAccount(confirming.id, targetId)
        setIsMerging(false)
        setResult({
            status: response.status,
            message:
                response.message ??
                (response.status ? "Legacy account merged." : "Merge failed.")
        })

        if (response.status) {
            setRows((prev) => prev.filter((r) => r.id !== confirming.id))
            setChoices((prev) => {
                const next = { ...prev }
                delete next[confirming.id]
                return next
            })
            router.refresh()
        }
        setConfirming(null)
    }

    const confirmTarget = confirming ? chosenTargetFor(confirming) : null
    const confirmSharesTeam =
        confirming && confirmTarget
            ? confirming.sameTeamIds.includes(confirmTarget.id)
            : false

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Legacy placeholder accounts</CardTitle>
                    <CardDescription>
                        The archive backfill could only attach a roster entry to
                        a real account on an exact name match, so anyone
                        recorded under a nickname or a former surname got a
                        placeholder account instead — and their history never
                        reached their profile. Mapping a placeholder to a member
                        moves every record across and deletes the placeholder.
                        Leave the ones who simply left the league: their records
                        are correct as they stand.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {result && (
                        <StatusBanner
                            variant={result.status ? "success" : "error"}
                        >
                            {result.message}
                        </StatusBanner>
                    )}
                    {targetsError && (
                        <StatusBanner variant="error">
                            {targetsError}
                        </StatusBanner>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative min-w-56 flex-1">
                            <RiSearchLine className="absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value)
                                    setPage(0)
                                }}
                                placeholder="Search placeholders by name or email..."
                                className="pl-8"
                            />
                        </div>
                        <Button
                            variant={onlySuggested ? "default" : "outline"}
                            onClick={() => {
                                setOnlySuggested((v) => !v)
                                setPage(0)
                            }}
                        >
                            Only with a suggestion ({suggestedCount})
                        </Button>
                        <span className="text-muted-foreground text-sm">
                            {filtered.length} of {rows.length} shown
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Placeholder</TableHead>
                                    <TableHead>History</TableHead>
                                    <TableHead className="w-96">
                                        Map to member
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Action
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visible.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={4}
                                            className="py-8 text-center text-muted-foreground"
                                        >
                                            {rows.length === 0
                                                ? "No legacy placeholder accounts remain."
                                                : "No placeholders match this filter."}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    visible.map((row) => {
                                        const chosenId = chosenIdFor(row)
                                        const sharesTeam =
                                            chosenId !== "" &&
                                            row.sameTeamIds.includes(chosenId)
                                        return (
                                            <TableRow key={row.id}>
                                                <TableCell className="align-top">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">
                                                            {row.name}
                                                        </span>
                                                        <Badge variant="outline">
                                                            {row.kind === "hoc"
                                                                ? "champion"
                                                                : "roster"}
                                                        </Badge>
                                                    </div>
                                                    <span className="text-muted-foreground text-xs">
                                                        {row.email}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="align-top text-sm">
                                                    <div>
                                                        {row.draftCount} roster
                                                        {row.draftCount === 1
                                                            ? " spot"
                                                            : " spots"}
                                                        {row.captainCount > 0 &&
                                                            `, ${row.captainCount} captaincy${
                                                                row.captainCount ===
                                                                1
                                                                    ? ""
                                                                    : "s"
                                                            }`}
                                                    </div>
                                                    <span className="text-muted-foreground text-xs">
                                                        {row.seasonCodes.join(
                                                            ", "
                                                        ) || "no seasons"}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="align-top">
                                                    <UserEmailCombobox
                                                        users={targets ?? []}
                                                        value={chosenId || null}
                                                        onChange={(id) =>
                                                            setChoices(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [row.id]: id
                                                                })
                                                            )
                                                        }
                                                        disabled={
                                                            targets === null
                                                        }
                                                        placeholder={
                                                            targets === null
                                                                ? "Loading members..."
                                                                : "No match — leave as is"
                                                        }
                                                    />
                                                    {row.suggestion &&
                                                        chosenId ===
                                                            row.suggestion
                                                                .id && (
                                                            <span className="mt-1 inline-flex text-muted-foreground text-xs">
                                                                Suggested —{" "}
                                                                {REASON_LABEL[
                                                                    row
                                                                        .suggestion
                                                                        .reason
                                                                ] ??
                                                                    row
                                                                        .suggestion
                                                                        .reason}{" "}
                                                                match
                                                            </span>
                                                        )}
                                                    {sharesTeam && (
                                                        <span className="mt-1 flex items-center gap-1 text-amber-600 text-xs dark:text-amber-400">
                                                            <RiAlertLine className="h-3.5 w-3.5" />
                                                            Played on the same
                                                            team — likely two
                                                            different people.
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right align-top">
                                                    <Button
                                                        size="sm"
                                                        disabled={!chosenId}
                                                        onClick={() =>
                                                            setConfirming(row)
                                                        }
                                                    >
                                                        Merge
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {pageCount > 1 && (
                        <div className="flex items-center justify-between">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === 0}
                                onClick={() => setPage(currentPage - 1)}
                            >
                                Previous
                            </Button>
                            <span className="text-muted-foreground text-sm">
                                Page {currentPage + 1} of {pageCount}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage >= pageCount - 1}
                                onClick={() => setPage(currentPage + 1)}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog
                open={confirming !== null}
                onOpenChange={(open) => !open && setConfirming(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm merge</DialogTitle>
                        <DialogDescription>
                            This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="rounded-md bg-red-50 p-4 dark:bg-red-950">
                            <p className="font-medium text-red-800 text-sm dark:text-red-200">
                                Placeholder (will be DELETED)
                            </p>
                            {confirming && (
                                <div className="mt-2 text-red-700 text-sm dark:text-red-300">
                                    <p>{confirming.name}</p>
                                    <p className="text-xs">
                                        {confirming.email}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="rounded-md bg-green-50 p-4 dark:bg-green-950">
                            <p className="font-medium text-green-800 text-sm dark:text-green-200">
                                Member (will be KEPT)
                            </p>
                            {confirmTarget && (
                                <div className="mt-2 text-green-700 text-sm dark:text-green-300">
                                    <p>{confirmTarget.name}</p>
                                    <p className="text-xs">
                                        {confirmTarget.email}
                                    </p>
                                </div>
                            )}
                        </div>

                        {confirmSharesTeam && (
                            <StatusBanner variant="warning">
                                These two appear on the same team roster. A
                                roster never lists one person twice, so this is
                                most likely two different people. Merge only if
                                you know otherwise.
                            </StatusBanner>
                        )}

                        <p className="text-muted-foreground text-sm">
                            {confirming?.draftCount ?? 0} roster spot(s) and{" "}
                            {confirming?.captainCount ?? 0} captaincy(s) move to
                            the member account, along with any other records the
                            placeholder holds.
                        </p>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirming(null)}
                            disabled={isMerging}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirm}
                            disabled={isMerging}
                        >
                            {isMerging ? "Merging..." : "Confirm merge"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
