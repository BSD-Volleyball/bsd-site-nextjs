"use client"

import { useCallback } from "react"
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
    width: 280,
    boxHeight: 120,
    canvasPadding: 25,
    spaceBetweenColumns: 50,
    spaceBetweenRows: 40,
    connectorColor: "#d1d5db",
    connectorColorHighlight: "#10b981",
    roundHeader: {
        isShown: true,
        height: 25,
        marginBottom: 25,
        fontSize: 14,
        fontColor: "#6b7280",
        backgroundColor: "transparent",
        fontFamily: "system-ui, sans-serif",
        roundTextGenerator: undefined
    },
    roundSeparatorWidth: 24,
    lineInfo: {
        separation: -13,
        homeVisitorSpread: 0.5
    },
    horizontalOffset: 13,
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
        teamNameFallback,
        resultFallback
    } = props
    const bm = match as unknown as BracketMatch

    // BYE placeholder — render a minimal muted card
    if (bm.matchNum < 0) {
        const byeTeam =
            topParty?.name && topParty.name !== "BYE"
                ? topParty.name
                : bottomParty?.name && bottomParty.name !== "BYE"
                  ? bottomParty.name
                  : teamNameFallback
        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                    background: "var(--muted)",
                    borderRadius: "6px",
                    border: "1px dashed var(--border)",
                    fontSize: "11px",
                    fontFamily: "system-ui, sans-serif",
                    color: "var(--muted-foreground)",
                    opacity: 0.7
                }}
            >
                <span>{byeTeam} (BYE)</span>
            </div>
        )
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                background: "var(--card)",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                overflow: "hidden",
                fontSize: "12px",
                fontFamily: "system-ui, sans-serif",
                color: "var(--foreground)"
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "3px 8px",
                    fontSize: "10px",
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
            />
            <PartyRow
                name={bottomParty?.name || teamNameFallback}
                resultText={bottomParty?.resultText ?? resultFallback}
                won={bottomWon}
            />

            {bm.scoresDisplay !== "\u2014" && (
                <div
                    style={{
                        fontSize: "9px",
                        color: "var(--muted-foreground)",
                        padding: "2px 8px 3px",
                        borderTop: "1px solid var(--border)"
                    }}
                >
                    Sets: {bm.scoresDisplay}
                </div>
            )}
        </div>
    )
}

function PartyRow({
    name,
    resultText,
    won
}: {
    name: string
    resultText: string | null | undefined
    won: boolean
}) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 8px",
                backgroundColor: won
                    ? "rgba(16, 185, 129, 0.1)"
                    : "transparent",
                fontWeight: won ? 600 : 400,
                color: won ? "#059669" : "var(--foreground)"
            }}
        >
            <span
                style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "170px"
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
    return (
        <div
            style={{ overflowX: "auto", overflowY: "auto", maxHeight: "800px" }}
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
