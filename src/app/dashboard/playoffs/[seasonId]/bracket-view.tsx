"use client"

import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react"
import dynamic from "next/dynamic"
import type {
    MatchComponentProps,
    SvgWrapperProps
} from "@/lib/playoff-brackets"
import type { BracketMatch } from "./actions"

const DoubleEliminationBracket = dynamic(
    () =>
        import("@/lib/playoff-brackets").then(
            (mod) => mod.DoubleEliminationBracket
        ),
    { ssr: false }
)

// Must provide ALL properties — the library does NOT merge with defaults.
const BRACKET_STYLE = {
    width: 185,
    boxHeight: 90,
    canvasPadding: 12,
    spaceBetweenColumns: 24,
    spaceBetweenRows: 16,
    connectorColor: "#d1d5db",
    connectorColorHighlight: "#10b981",
    roundHeader: {
        isShown: true,
        height: 20,
        marginBottom: 12,
        fontSize: 11,
        fontColor: "#6b7280",
        backgroundColor: "transparent",
        fontFamily: "system-ui, sans-serif",
        roundTextGenerator: undefined
    },
    roundSeparatorWidth: 16,
    lineInfo: {
        separation: -10,
        homeVisitorSpread: 0.5
    },
    horizontalOffset: 10,
    wonBywalkOverText: "WO",
    lostByNoShowText: "NS"
}

function CustomMatch(props: MatchComponentProps) {
    const {
        match,
        topParty,
        bottomParty,
        topWon,
        bottomWon,
        topHovered,
        bottomHovered,
        teamNameFallback,
        resultFallback,
        onMouseEnter,
        onMouseLeave
    } = props
    const bm = match as unknown as BracketMatch
    const isBye = bm.matchNum < 0

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                background: isBye ? "var(--muted)" : "var(--card)",
                borderRadius: "4px",
                border: isBye
                    ? "1px dashed var(--border)"
                    : "1px solid var(--border)",
                overflow: "hidden",
                fontSize: "11px",
                fontFamily: "system-ui, sans-serif",
                color: "var(--foreground)",
                opacity: isBye ? 0.7 : 1
            }}
        >
            {isBye ? (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: 1,
                        fontSize: "10px",
                        color: "var(--muted-foreground)"
                    }}
                >
                    <span>
                        {topParty?.name && topParty.name !== "BYE"
                            ? topParty.name
                            : bottomParty?.name && bottomParty.name !== "BYE"
                              ? bottomParty.name
                              : teamNameFallback}{" "}
                        (BYE)
                    </span>
                </div>
            ) : (
                <>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "2px 6px",
                            fontSize: "9px",
                            color: "var(--muted-foreground)",
                            borderBottom: "1px solid var(--border)"
                        }}
                    >
                        <span>
                            #{bm.matchNum} W{bm.week}
                        </span>
                        <span>
                            {bm.date || "TBD"}
                            {bm.time ? ` ${bm.time}` : ""}
                            {bm.court !== null ? ` Ct${bm.court}` : ""}
                        </span>
                    </div>

                    <PartyRow
                        name={topParty?.name || teamNameFallback}
                        resultText={topParty?.resultText ?? resultFallback}
                        won={topWon}
                        hovered={topHovered}
                        partyId={topParty?.id}
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                    />
                    <PartyRow
                        name={bottomParty?.name || teamNameFallback}
                        resultText={bottomParty?.resultText ?? resultFallback}
                        won={bottomWon}
                        hovered={bottomHovered}
                        partyId={bottomParty?.id}
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                    />

                    {bm.scoresDisplay !== "\u2014" && (
                        <div
                            style={{
                                fontSize: "10px",
                                color: "var(--muted-foreground)",
                                padding: "2px 6px",
                                borderTop: "1px solid var(--border)"
                            }}
                        >
                            Sets: {bm.scoresDisplay}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function PartyRow({
    name,
    resultText,
    won,
    hovered,
    partyId,
    onMouseEnter,
    onMouseLeave
}: {
    name: string
    resultText: string | null | undefined
    won: boolean
    hovered: boolean
    partyId?: string | number
    onMouseEnter?: (partyId: string | number) => void
    onMouseLeave?: () => void
}) {
    return (
        // biome-ignore lint/a11y: decorative hover highlight inside SVG bracket
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "3px 6px",
                backgroundColor: hovered
                    ? "rgba(16, 185, 129, 0.15)"
                    : won
                      ? "color-mix(in srgb, var(--primary) 12%, transparent)"
                      : "transparent",
                fontWeight: won || hovered ? 600 : 400,
                color: hovered
                    ? "#059669"
                    : won
                      ? "var(--primary)"
                      : "var(--foreground)",
                cursor: "pointer",
                transition: "background-color 0.15s"
            }}
            onMouseEnter={() => partyId && onMouseEnter?.(partyId)}
            onMouseLeave={() => onMouseLeave?.()}
        >
            <span
                style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "105px"
                }}
            >
                {name}
            </span>
            <span
                style={{
                    fontVariantNumeric: "tabular-nums",
                    marginLeft: "8px"
                }}
            >
                {resultText ?? "\u2014"}
            </span>
        </div>
    )
}

function ScrollWrapper({ children }: SvgWrapperProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const dragging = useRef(false)
    const startX = useRef(0)
    const startY = useRef(0)
    const scrollLeftRef = useRef(0)
    const scrollTopRef = useRef(0)

    const onMouseDown = (e: ReactMouseEvent) => {
        const el = containerRef.current
        if (!el) return
        dragging.current = true
        startX.current = e.clientX
        startY.current = e.clientY
        scrollLeftRef.current = el.scrollLeft
        scrollTopRef.current = el.scrollTop
        el.style.cursor = "grabbing"
        el.style.userSelect = "none"
    }

    const onMouseMove = (e: ReactMouseEvent) => {
        if (!dragging.current) return
        const el = containerRef.current
        if (!el) return
        el.scrollLeft = scrollLeftRef.current - (e.clientX - startX.current)
        el.scrollTop = scrollTopRef.current - (e.clientY - startY.current)
    }

    const onMouseUp = () => {
        dragging.current = false
        const el = containerRef.current
        if (el) {
            el.style.cursor = "grab"
            el.style.userSelect = ""
        }
    }

    return (
        // biome-ignore lint/a11y: drag-to-pan scroll container for bracket
        <div
            ref={containerRef}
            style={{ overflow: "auto", cursor: "grab" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
        >
            {children}
        </div>
    )
}

export function BracketView({
    matches
}: {
    matches: { upper: BracketMatch[]; lower: BracketMatch[] }
}) {
    const svgWrapper = useCallback(
        (props: SvgWrapperProps) => <ScrollWrapper {...props} />,
        []
    )

    return (
        <div className="w-full rounded-lg border bg-muted/20">
            <DoubleEliminationBracket
                // biome-ignore lint: library types don't match our extended BracketMatch
                matches={matches as any}
                matchComponent={CustomMatch}
                svgWrapper={svgWrapper}
                options={{ style: BRACKET_STYLE }}
            />
        </div>
    )
}
