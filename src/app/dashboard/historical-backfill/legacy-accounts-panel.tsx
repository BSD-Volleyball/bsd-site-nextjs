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
import { getMergeTargets } from "./actions"

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

    // Merging navigates away to Merge Users, so the list is refreshed by the
    // server on the way back rather than being patched locally.
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

    // Every account feeds the picker -- members and placeholders alike -- so
    // they are fetched once on first use rather than shipped with every page
    // load.
    const loadTargets = useCallback(async () => {
        if (targets !== null) return
        const response = await getMergeTargets()
        if (response.status) {
            setTargets(response.data)
        } else {
            setTargetsError(response.message || "Failed to load accounts.")
        }
    }, [targets])

    useEffect(() => {
        void loadTargets()
    }, [loadTargets])

    const chosenIdFor = (account: LegacyAccount) =>
        choices[account.id] ?? account.suggestion?.id ?? ""

    // The picker offers real members and the other placeholders alike, so the
    // label has to say which is which -- mapping onto a placeholder folds two
    // duplicate historical entries together rather than reuniting someone with
    // their profile. Built once; each row then drops only its own id, which it
    // obviously cannot merge with.
    const options = useMemo(
        () =>
            (targets ?? []).map((t) =>
                t.isPlaceholder ? { ...t, name: `${t.name} — placeholder` } : t
            ),
        [targets]
    )

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

    // This panel is step 1 of the shared merge flow: it picks the pair, then
    // hands off to Merge Users, where the admin composes the surviving record
    // field by field and confirms. Nothing is written from here.
    const openMerge = (account: LegacyAccount) => {
        const targetId = chosenIdFor(account)
        if (!targetId) return
        router.push(
            `/dashboard/merge-users?a=${encodeURIComponent(account.id)}&b=${encodeURIComponent(targetId)}`
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Legacy placeholder accounts</CardTitle>
                <CardDescription>
                    The archive backfill could only attach a roster entry to a
                    real account on an exact name match, so anyone recorded
                    under a nickname or a former surname got a placeholder
                    account instead — and their history never reached their
                    profile. Pick the account a placeholder belongs to and
                    review the merge on the Merge Users page, which moves every
                    record across and deletes the placeholder. The picker offers
                    the other placeholders as well as real members, so a player
                    the backfill recorded under two spellings can be folded into
                    one entry. Leave the ones who simply left the league: their
                    records are correct as they stand.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {targetsError && (
                    <StatusBanner variant="error">{targetsError}</StatusBanner>
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
                                    Map to account
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
                                                <span className="text-muted-foreground text-sm">
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
                                                <span className="text-muted-foreground text-sm">
                                                    {row.seasonCodes.join(
                                                        ", "
                                                    ) || "no seasons"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <UserEmailCombobox
                                                    users={options.filter(
                                                        (t) => t.id !== row.id
                                                    )}
                                                    value={chosenId || null}
                                                    onChange={(id) =>
                                                        setChoices((prev) => ({
                                                            ...prev,
                                                            [row.id]: id
                                                        }))
                                                    }
                                                    disabled={targets === null}
                                                    placeholder={
                                                        targets === null
                                                            ? "Loading accounts..."
                                                            : "No match — leave as is"
                                                    }
                                                />
                                                {row.suggestion &&
                                                    chosenId ===
                                                        row.suggestion.id && (
                                                        <span className="mt-1 inline-flex text-muted-foreground text-sm">
                                                            Suggested —{" "}
                                                            {REASON_LABEL[
                                                                row.suggestion
                                                                    .reason
                                                            ] ??
                                                                row.suggestion
                                                                    .reason}{" "}
                                                            match
                                                        </span>
                                                    )}
                                                {sharesTeam && (
                                                    <span className="mt-1 flex items-center gap-1 text-amber-600 text-sm dark:text-amber-400">
                                                        <RiAlertLine className="h-3.5 w-3.5" />
                                                        Played on the same team
                                                        — likely two different
                                                        people.
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right align-top">
                                                <Button
                                                    size="sm"
                                                    disabled={!chosenId}
                                                    onClick={() =>
                                                        openMerge(row)
                                                    }
                                                >
                                                    Review &amp; merge
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
    )
}
