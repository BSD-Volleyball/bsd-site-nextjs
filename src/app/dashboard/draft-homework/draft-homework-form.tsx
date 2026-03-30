"use client"

import { useState, useMemo, type Dispatch, type SetStateAction } from "react"
import { RiDeleteBin2Line } from "@remixicon/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose
} from "@/components/ui/dialog"
import { PlayerCombobox } from "./player-combobox"
import { saveDraftHomework } from "./actions"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { getPlayerDetailsPublic } from "@/app/dashboard/view-signups/actions"
import type { DraftHomeworkData, DraftHomeworkPlayer } from "./actions"

interface DraftHomeworkFormProps {
    data: DraftHomeworkData
    playerPicUrl: string
}

// Key format: `${m|f}-${round}-${slot}`
type Selections = Record<string, string | null>

const CONSIDERING_ROUND = 9

function buildInitialSelections(data: DraftHomeworkData): Selections {
    const s: Selections = {}
    for (const sel of data.existingSelections) {
        const tabKey = sel.isMaleTab ? "m" : "f"
        s[`${tabKey}-${sel.round}-${sel.slot}`] = sel.playerId
    }
    return s
}

function parseGenderSplit(genderSplit: string): [number, number] {
    const parts = genderSplit.split("-").map(Number)
    return [parts[0] ?? 0, parts[1] ?? 0]
}

interface PlayerPicProps {
    player: DraftHomeworkPlayer
    playerPicUrl: string
    height: string
    onOpen: (userId: string) => void
}

function PlayerPic({ player, playerPicUrl, height, onOpen }: PlayerPicProps) {
    const src = player.picture ? `${playerPicUrl}${player.picture}` : null
    const displayName = `${player.firstName} ${player.lastName}`
    return src ? (
        <button
            type="button"
            title={displayName}
            onClick={() => onOpen(player.userId)}
            className="shrink-0 cursor-pointer rounded transition-opacity hover:opacity-80"
            style={{ height }}
        >
            <img
                src={src}
                alt={displayName}
                className="h-full w-auto rounded object-cover"
            />
        </button>
    ) : (
        <button
            type="button"
            title={displayName}
            onClick={() => onOpen(player.userId)}
            className="flex shrink-0 cursor-pointer items-center justify-center rounded bg-muted text-muted-foreground text-xs transition-opacity hover:opacity-80"
            style={{ height, width: "2.5rem" }}
        >
            {player.firstName[0]}
            {player.lastName[0]}
        </button>
    )
}

interface RoundGroupProps {
    label: string
    round: number
    numTeams: number
    tabKey: "m" | "f"
    players: DraftHomeworkPlayer[]
    selections: Selections
    excludeIds: string[]
    draftedIds: string[]
    playerPicUrl: string
    onChange: (key: string, userId: string | null) => void
    onOpenPlayer: (userId: string) => void
    isDynamic?: boolean
    controlledDynamicCount?: number
    onControlledDynamicCountChange?: Dispatch<SetStateAction<number>>
}

function RoundGroup({
    label,
    round,
    numTeams,
    tabKey,
    players,
    selections,
    excludeIds,
    draftedIds,
    playerPicUrl,
    onChange,
    onOpenPlayer,
    isDynamic = false,
    controlledDynamicCount,
    onControlledDynamicCountChange
}: RoundGroupProps) {
    const [internalDynamicCount, setInternalDynamicCount] = useState(() => {
        if (!isDynamic) return numTeams
        const existing = Object.keys(selections).filter((k) =>
            k.startsWith(`${tabKey}-${round}-`)
        ).length
        return Math.max(1, existing)
    })

    const dynamicCount =
        isDynamic && controlledDynamicCount !== undefined
            ? controlledDynamicCount
            : internalDynamicCount
    const setDynamicCount: Dispatch<SetStateAction<number>> =
        isDynamic && onControlledDynamicCountChange !== undefined
            ? onControlledDynamicCountChange
            : setInternalDynamicCount

    const slotCount = isDynamic ? dynamicCount : numTeams
    const slots = Array.from({ length: slotCount }, (_, i) => i)
    const draftedSet = useMemo(() => new Set(draftedIds), [draftedIds])

    const handleRemoveSlot = (slotToRemove: number) => {
        for (let j = slotToRemove; j < dynamicCount - 1; j++) {
            onChange(
                `${tabKey}-${round}-${j}`,
                selections[`${tabKey}-${round}-${j + 1}`] ?? null
            )
        }
        onChange(`${tabKey}-${round}-${dynamicCount - 1}`, null)
        setDynamicCount((c) => c - 1)
    }

    const selectedPlayers = slots
        .map((slot) => {
            const key = `${tabKey}-${round}-${slot}`
            const userId = selections[key] ?? null
            return userId
                ? (players.find((p) => p.userId === userId) ?? null)
                : null
        })
        .filter((p): p is DraftHomeworkPlayer => p !== null)

    // Each combobox is h-8 = 32px, gap-1 = 4px
    const totalHeightPx = slotCount * 32 + (slotCount - 1) * 4
    // Reference height matches a full round (numTeams slots) — used for consistent photo sizing in the dynamic section
    const referenceHeightPx = numTeams * 32 + (numTeams - 1) * 4

    // Chunk selected players into rows of numTeams for the dynamic (Considering) section
    const photoRows: DraftHomeworkPlayer[][] = []
    if (isDynamic) {
        for (let i = 0; i < selectedPlayers.length; i += numTeams) {
            photoRows.push(selectedPlayers.slice(i, i + numTeams))
        }
    }

    return (
        <div className="mb-4">
            <p className="mb-1 font-medium text-sm">{label}</p>
            <div className="overflow-x-auto">
                <div
                    className="flex items-start gap-3"
                    style={{ minWidth: "max-content" }}
                >
                    {/* Player selectors */}
                    <div
                        className="flex min-w-48 flex-col gap-1 rounded-md border bg-muted/30"
                        style={{ width: "220px" }}
                    >
                        {slots.map((slot) => {
                            const key = `${tabKey}-${round}-${slot}`
                            const uid = selections[key] ?? null
                            const isInvalid = !!uid && draftedSet.has(uid)
                            return (
                                <div key={key} className="flex items-center">
                                    <div className="min-w-0 flex-1">
                                        <PlayerCombobox
                                            players={players}
                                            value={uid}
                                            onChange={(userId) =>
                                                onChange(key, userId)
                                            }
                                            excludeIds={excludeIds}
                                            draftedIds={draftedIds}
                                            isInvalid={isInvalid}
                                        />
                                    </div>
                                    {isDynamic && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleRemoveSlot(slot)
                                            }
                                            className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                                            title="Remove"
                                        >
                                            <RiDeleteBin2Line className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                        {isDynamic && (
                            <button
                                type="button"
                                onClick={() => setDynamicCount((c) => c + 1)}
                                className="px-2 py-1 text-left text-muted-foreground text-xs hover:text-foreground"
                            >
                                + Add player
                            </button>
                        )}
                    </div>

                    {/* Player pictures */}
                    {isDynamic ? (
                        <div className="flex flex-col gap-2">
                            {photoRows.map((row, rowIdx) => (
                                <div
                                    key={rowIdx}
                                    className="flex items-stretch gap-1"
                                    style={{ height: `${referenceHeightPx}px` }}
                                >
                                    {row.map((player) => (
                                        <PlayerPic
                                            key={player.userId}
                                            player={player}
                                            playerPicUrl={playerPicUrl}
                                            height="100%"
                                            onOpen={onOpenPlayer}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div
                            className="flex items-stretch gap-1"
                            style={{ height: `${totalHeightPx}px` }}
                        >
                            {selectedPlayers.map((player) => (
                                <PlayerPic
                                    key={player.userId}
                                    player={player}
                                    playerPicUrl={playerPicUrl}
                                    height="100%"
                                    onOpen={onOpenPlayer}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Print layout components ────────────────────────────────────────────────

function getPlayersForRound(
    tabKey: "m" | "f",
    round: number,
    selections: Selections,
    players: DraftHomeworkPlayer[]
): DraftHomeworkPlayer[] {
    const result: DraftHomeworkPlayer[] = []
    for (let slot = 0; slot < 30; slot++) {
        const userId = selections[`${tabKey}-${round}-${slot}`]
        if (userId) {
            const player = players.find((p) => p.userId === userId)
            if (player) result.push(player)
        }
    }
    return result
}

function PrintPlayerCard({
    player,
    playerPicUrl
}: {
    player: DraftHomeworkPlayer
    playerPicUrl: string
}) {
    const src = player.picture ? `${playerPicUrl}${player.picture}` : null
    const displayName = player.preferredName
        ? `${player.preferredName} ${player.lastName}`
        : `${player.firstName} ${player.lastName}`
    return (
        <div style={{ textAlign: "center", width: "1.05in" }}>
            {src ? (
                <img
                    src={src}
                    alt={displayName}
                    style={{
                        width: "1in",
                        height: "1.25in",
                        objectFit: "cover",
                        objectPosition: "top",
                        borderRadius: "3px",
                        display: "block"
                    }}
                />
            ) : (
                <div
                    style={{
                        width: "1in",
                        height: "1.25in",
                        background: "#e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "16pt",
                        borderRadius: "3px"
                    }}
                >
                    {player.firstName[0]}
                    {player.lastName[0]}
                </div>
            )}
            <div
                style={{
                    fontSize: "7.5pt",
                    marginTop: "3px",
                    lineHeight: 1.25,
                    wordBreak: "break-word"
                }}
            >
                {displayName}
            </div>
            {player.oldId > 0 && (
                <div
                    style={{
                        fontSize: "7pt",
                        color: "#888",
                        lineHeight: 1.2
                    }}
                >
                    #{player.oldId}
                </div>
            )}
        </div>
    )
}

function PrintTabSection({
    tabKey,
    numRounds,
    players,
    selections,
    playerPicUrl
}: {
    tabKey: "m" | "f"
    numRounds: number
    players: DraftHomeworkPlayer[]
    selections: Selections
    playerPicUrl: string
}) {
    const rounds = Array.from({ length: numRounds }, (_, i) => i + 1)
    const consideringPlayers = getPlayersForRound(
        tabKey,
        CONSIDERING_ROUND,
        selections,
        players
    )

    // Auto-scale to guarantee content fits within 10in of usable page height.
    // Each round row ≈ 1.85in (label + 1.25in photo + name + margin).
    // Header ≈ 0.45in. Considering section adds another ~1.85in if present.
    const hasConsidering = consideringPlayers.length > 0
    const estimatedHeightIn = numRounds * 1.85 + (hasConsidering ? 1.85 : 0)
    const zoom = Math.min(1, 10.25 / estimatedHeightIn)

    return (
        <div style={{ zoom: zoom }}>
            {rounds.map((round) => {
                const roundPlayers = getPlayersForRound(
                    tabKey,
                    round,
                    selections,
                    players
                )
                if (roundPlayers.length === 0) return null
                return (
                    <div key={round} style={{ marginBottom: "0.18in" }}>
                        <div
                            style={{
                                fontSize: "9pt",
                                fontWeight: "bold",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: "#444",
                                marginBottom: "0.08in",
                                borderBottom: "1px solid #ccc",
                                paddingBottom: "2px"
                            }}
                        >
                            Round {round}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.1in"
                            }}
                        >
                            {roundPlayers.map((player) => (
                                <PrintPlayerCard
                                    key={player.userId}
                                    player={player}
                                    playerPicUrl={playerPicUrl}
                                />
                            ))}
                        </div>
                    </div>
                )
            })}

            {consideringPlayers.length > 0 && (
                <div style={{ marginTop: "0.1in" }}>
                    <div
                        style={{
                            fontSize: "9pt",
                            fontWeight: "bold",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            color: "#444",
                            marginBottom: "0.08in",
                            borderBottom: "1px solid #ccc",
                            paddingBottom: "2px"
                        }}
                    >
                        Considering
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.1in"
                        }}
                    >
                        {consideringPlayers.map((player) => (
                            <PrintPlayerCard
                                key={player.userId}
                                player={player}
                                playerPicUrl={playerPicUrl}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── End print layout components ─────────────────────────────────────────────

interface SuggestedPlayerListProps {
    players: DraftHomeworkPlayer[]
    selectedIds: Set<string>
    playerPicUrl: string
    onOpenPlayer: (userId: string) => void
    onQuickAdd: (userId: string) => void
}

function SuggestedPlayerList({
    players,
    selectedIds,
    playerPicUrl,
    onOpenPlayer,
    onQuickAdd
}: SuggestedPlayerListProps) {
    const visible = players.filter((p) => !selectedIds.has(p.userId))

    if (visible.length === 0) {
        return (
            <p className="text-muted-foreground text-sm">
                All suggested players have been selected.
            </p>
        )
    }

    return (
        <div className="flex flex-wrap gap-3">
            {visible.map((player) => {
                const displayName = player.preferredName
                    ? `${player.preferredName} ${player.lastName}`
                    : `${player.firstName} ${player.lastName}`
                return (
                    <div
                        key={player.userId}
                        className="flex flex-col items-center gap-1 text-center"
                    >
                        <PlayerPic
                            player={player}
                            playerPicUrl={playerPicUrl}
                            height="5rem"
                            onOpen={onOpenPlayer}
                        />
                        <div className="flex items-center gap-0.5">
                            <span className="max-w-16 text-muted-foreground text-xs leading-tight">
                                {displayName}
                            </span>
                            <button
                                type="button"
                                onClick={() => onQuickAdd(player.userId)}
                                title={`Add ${displayName} to next open slot`}
                                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xs leading-none hover:bg-primary/20"
                            >
                                +
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

interface TabContentProps {
    tabKey: "m" | "f"
    numRounds: number
    numTeams: number
    players: DraftHomeworkPlayer[]
    suggestedPlayers: DraftHomeworkPlayer[]
    selections: Selections
    draftedIds: string[]
    playerPicUrl: string
    onChange: (key: string, userId: string | null) => void
    onOpenPlayer: (userId: string) => void
}

function HomeworkTabContent({
    tabKey,
    numRounds,
    numTeams,
    players,
    suggestedPlayers,
    selections,
    draftedIds,
    playerPicUrl,
    onChange,
    onOpenPlayer
}: TabContentProps) {
    const allSelectedIds = useMemo(() => {
        const ids: string[] = []
        for (const [key, userId] of Object.entries(selections)) {
            if (key.startsWith(`${tabKey}-`) && userId) {
                ids.push(userId)
            }
        }
        return ids
    }, [selections, tabKey])

    const selectedIdSet = useMemo(
        () => new Set(allSelectedIds),
        [allSelectedIds]
    )

    const [consideringCount, setConsideringCount] = useState(() => {
        const existing = Object.keys(selections).filter((k) =>
            k.startsWith(`${tabKey}-${CONSIDERING_ROUND}-`)
        ).length
        return Math.max(1, existing)
    })

    const handleQuickAdd = (userId: string) => {
        // Try regular rounds first (round 1..numRounds, slots 0..numTeams-1)
        for (let round = 1; round <= numRounds; round++) {
            for (let slot = 0; slot < numTeams; slot++) {
                const key = `${tabKey}-${round}-${slot}`
                if (!selections[key]) {
                    onChange(key, userId)
                    return
                }
            }
        }
        // Fall back to Considering — find first empty slot or append
        for (let slot = 0; slot < consideringCount; slot++) {
            const key = `${tabKey}-${CONSIDERING_ROUND}-${slot}`
            if (!selections[key]) {
                onChange(key, userId)
                return
            }
        }
        // All considering slots filled, append a new one
        const newSlot = consideringCount
        setConsideringCount((c) => c + 1)
        onChange(`${tabKey}-${CONSIDERING_ROUND}-${newSlot}`, userId)
    }

    const rounds = Array.from({ length: numRounds }, (_, i) => i + 1)

    return (
        <div className="pt-4">
            {rounds.map((round) => (
                <RoundGroup
                    key={round}
                    label={`Round ${round}`}
                    round={round}
                    numTeams={numTeams}
                    tabKey={tabKey}
                    players={players}
                    selections={selections}
                    excludeIds={allSelectedIds}
                    draftedIds={draftedIds}
                    playerPicUrl={playerPicUrl}
                    onChange={onChange}
                    onOpenPlayer={onOpenPlayer}
                />
            ))}
            <RoundGroup
                label="Considering"
                round={CONSIDERING_ROUND}
                numTeams={numTeams}
                tabKey={tabKey}
                players={players}
                selections={selections}
                excludeIds={allSelectedIds}
                draftedIds={draftedIds}
                playerPicUrl={playerPicUrl}
                onChange={onChange}
                onOpenPlayer={onOpenPlayer}
                isDynamic
                controlledDynamicCount={consideringCount}
                onControlledDynamicCountChange={setConsideringCount}
            />

            {suggestedPlayers.length > 0 && (
                <div className="mt-6 rounded-md border bg-muted/20 p-4">
                    <p className="mb-1 font-semibold text-sm">
                        Players To Consider
                    </p>
                    <p className="mb-3 text-muted-foreground text-xs">
                        You are free to select any registered player above. As
                        an aid here are players that based on historical data
                        and captain&apos;s ratings may end up in this division.
                        Players you&apos;ve already selected are hidden. Click a
                        photo to view their profile.
                    </p>
                    <SuggestedPlayerList
                        players={suggestedPlayers}
                        selectedIds={selectedIdSet}
                        playerPicUrl={playerPicUrl}
                        onOpenPlayer={onOpenPlayer}
                        onQuickAdd={handleQuickAdd}
                    />
                </div>
            )}
        </div>
    )
}

export function DraftHomeworkForm({
    data,
    playerPicUrl
}: DraftHomeworkFormProps) {
    const router = useRouter()
    const [selections, setSelections] = useState<Selections>(() =>
        buildInitialSelections(data)
    )
    const [saving, setSaving] = useState(false)
    const [showIncompleteDialog, setShowIncompleteDialog] = useState(false)
    const modal = usePlayerDetailModal({ fetchFn: getPlayerDetailsPublic })

    const [maleRounds, nonMaleRounds] = parseGenderSplit(data.genderSplit)
    const draftedSet = useMemo(
        () => new Set(data.draftedPlayerIds),
        [data.draftedPlayerIds]
    )
    const draftedIds = data.draftedPlayerIds

    const handleChange = (key: string, userId: string | null) => {
        setSelections((prev) => ({ ...prev, [key]: userId }))
    }

    const handleSave = async () => {
        const hasInvalid = Object.values(selections).some(
            (uid) => uid && draftedSet.has(uid)
        )
        if (hasInvalid) {
            toast.error(
                "Please remove or replace drafted players (highlighted in red) before saving."
            )
            return
        }

        setSaving(true)
        try {
            const selectionEntries = Object.entries(selections)
                .filter(([, userId]) => userId !== null)
                .map(([key, userId]) => {
                    const parts = key.split("-")
                    const tabKey = parts[0]
                    const round = parseInt(parts[1], 10)
                    const slot = parseInt(parts[2], 10)
                    return {
                        round,
                        slot,
                        playerId: userId as string,
                        isMaleTab: tabKey === "m"
                    }
                })

            const result = await saveDraftHomework({
                selections: selectionEntries
            })

            if (result.status) {
                // Check if all required round slots are filled (excluding Considering)
                const requiredSlots =
                    (maleRounds + nonMaleRounds) * data.numTeams
                const filledRequiredSlots = selectionEntries.filter(
                    (s) => s.round !== CONSIDERING_ROUND
                ).length
                if (filledRequiredSlots < requiredSlots) {
                    setShowIncompleteDialog(true)
                } else {
                    toast.success(result.message)
                }
                router.refresh()
            } else {
                toast.error(result.message)
            }
        } finally {
            setSaving(false)
        }
    }

    const hasExisting = data.existingSelections.length > 0

    return (
        <>
            <style>{`@media print { @page { size: letter portrait; margin: 0.25in 0.5in 0.5in 0.5in; } }`}</style>

            {/* ── Print-only layout ── */}
            <div
                className="hidden print:block"
                style={{ fontFamily: "sans-serif" }}
            >
                <div style={{ breakAfter: "page" }}>
                    <PrintTabSection
                        tabKey="m"
                        numRounds={maleRounds}
                        players={data.malePlayers}
                        selections={selections}
                        playerPicUrl={playerPicUrl}
                    />
                </div>
                <div>
                    <PrintTabSection
                        tabKey="f"
                        numRounds={nonMaleRounds}
                        players={data.nonMalePlayers}
                        selections={selections}
                        playerPicUrl={playerPicUrl}
                    />
                </div>
            </div>

            {/* ── Screen layout ── */}
            <div className="space-y-4 print:hidden">
                {data.lastUpdatedAt && (
                    <p className="text-muted-foreground text-sm">
                        Last saved:{" "}
                        {new Date(data.lastUpdatedAt).toLocaleString(
                            undefined,
                            {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit"
                            }
                        )}
                    </p>
                )}

                <div className="flex items-center gap-3 rounded-md border bg-card p-4">
                    <p className="flex-1 text-muted-foreground text-sm">
                        Division:{" "}
                        <span className="font-medium text-foreground">
                            {data.divisionName}
                        </span>
                        {" · "}
                        {data.numTeams} teams ({data.genderSplit} split)
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.print()}
                    >
                        Print
                    </Button>
                    {/* Last Season's Draft button — temporarily hidden, re-enable when needed
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenLastSeasonDraft}
                >
                    Last Season&apos;s Draft
                </Button>
                */}
                </div>

                {/* Last Season's Draft dialog — temporarily hidden, re-enable when needed
            <Dialog
                open={lastSeasonDraftOpen}
                onOpenChange={setLastSeasonDraftOpen}
            >
                <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {lastSeasonDraft
                                ? `${lastSeasonDraft.divisionName} Division — ${lastSeasonDraft.seasonName.charAt(0).toUpperCase()}${lastSeasonDraft.seasonName.slice(1)} ${lastSeasonDraft.seasonYear} Draft`
                                : "Last Season's Draft"}
                        </DialogTitle>
                    </DialogHeader>

                    {lastSeasonDraftLoading && (
                        <p className="py-6 text-center text-muted-foreground text-sm">
                            Loading...
                        </p>
                    )}

                    {lastSeasonDraftError && !lastSeasonDraftLoading && (
                        <p className="py-6 text-center text-muted-foreground text-sm">
                            {lastSeasonDraftError}
                        </p>
                    )}

                    {lastSeasonDraft && !lastSeasonDraftLoading && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr>
                                        <th className="w-16 py-2 pr-4 text-left font-medium text-muted-foreground">
                                            Round
                                        </th>
                                        {lastSeasonDraft.teams.map((team) => {
                                            const captainName =
                                                team.captainPreferredName ??
                                                team.captainFirstName
                                            return (
                                                <th
                                                    key={team.teamId}
                                                    className="min-w-32 px-2 py-2 text-left font-medium"
                                                >
                                                    <span className="block truncate">
                                                        {captainName}{" "}
                                                        {team.captainLastName}
                                                    </span>
                                                    {team.teamName && (
                                                        <span className="block truncate font-normal text-muted-foreground text-xs">
                                                            {team.teamName}
                                                        </span>
                                                    )}
                                                </th>
                                            )
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from(
                                        { length: lastSeasonDraft.numRounds },
                                        (_, i) => i + 1
                                    ).map((round) => (
                                        <tr
                                            key={round}
                                            className="border-border/50 border-t"
                                        >
                                            <td className="py-1.5 pr-4 font-medium text-muted-foreground">
                                                {round}
                                            </td>
                                            {lastSeasonDraft.teams.map(
                                                (team) => {
                                                    const pick =
                                                        team.picks.find(
                                                            (p) =>
                                                                p.round ===
                                                                round
                                                        )
                                                    return (
                                                        <td
                                                            key={team.teamId}
                                                            className={`px-2 py-1.5 ${pick?.playerMale === false ? "text-pink-700 dark:text-pink-400" : ""}`}
                                                        >
                                                            {pick
                                                                ? `${pick.playerPreferredName ?? pick.playerFirstName} ${pick.playerLastName}`
                                                                : "—"}
                                                        </td>
                                                    )
                                                }
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Close</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            */}

                <Tabs defaultValue="males">
                    <TabsList>
                        <TabsTrigger
                            value="males"
                            className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 dark:data-[state=active]:bg-blue-900/40 dark:data-[state=active]:text-blue-300"
                        >
                            Males ({maleRounds} rounds)
                        </TabsTrigger>
                        <TabsTrigger
                            value="non-males"
                            className="data-[state=active]:bg-pink-100 data-[state=active]:text-pink-800 dark:data-[state=active]:bg-pink-900/40 dark:data-[state=active]:text-pink-300"
                        >
                            Non-Males ({nonMaleRounds} rounds)
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="males">
                        <HomeworkTabContent
                            tabKey="m"
                            numRounds={maleRounds}
                            numTeams={data.numTeams}
                            players={data.malePlayers}
                            suggestedPlayers={data.suggestedMalePlayers}
                            selections={selections}
                            draftedIds={draftedIds}
                            playerPicUrl={playerPicUrl}
                            onChange={handleChange}
                            onOpenPlayer={modal.openPlayerDetail}
                        />
                    </TabsContent>

                    <TabsContent value="non-males">
                        <HomeworkTabContent
                            tabKey="f"
                            numRounds={nonMaleRounds}
                            numTeams={data.numTeams}
                            players={data.nonMalePlayers}
                            suggestedPlayers={data.suggestedNonMalePlayers}
                            selections={selections}
                            draftedIds={draftedIds}
                            playerPicUrl={playerPicUrl}
                            onChange={handleChange}
                            onOpenPlayer={modal.openPlayerDetail}
                        />
                    </TabsContent>
                </Tabs>

                <div className="flex items-center gap-3 pt-2">
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : hasExisting ? "Update" : "Save"}
                    </Button>
                </div>

                <Dialog
                    open={showIncompleteDialog}
                    onOpenChange={setShowIncompleteDialog}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                Homework Saved — Not Yet Complete
                            </DialogTitle>
                            <DialogDescription>
                                Your selections have been saved, but your draft
                                homework is not complete until all round slots
                                are filled for both the Males and Non-Males
                                tabs. The Considering section is optional.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button>Got it</Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <PlayerDetailPopup
                    open={!!modal.selectedUserId}
                    onClose={modal.closePlayerDetail}
                    playerDetails={modal.playerDetails}
                    draftHistory={modal.draftHistory}
                    allSeasons={data.allSeasons}
                    playerPicUrl={playerPicUrl}
                    isLoading={modal.isLoading}
                    pairPickName={modal.pairPickName}
                    pairReason={modal.pairReason}
                    datesMissing={modal.unavailableDates}
                    playoffDates={modal.playoffDates}
                    ratingAverages={modal.ratingAverages}
                    sharedRatingNotes={modal.sharedRatingNotes}
                    privateRatingNotes={modal.privateRatingNotes}
                    viewerRating={modal.viewerRating}
                />
            </div>
        </>
    )
}
