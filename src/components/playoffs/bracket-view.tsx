"use client"

import {
    useCallback,
    useMemo,
    useRef,
    type MouseEvent as ReactMouseEvent
} from "react"
import dynamic from "next/dynamic"
import { formatMatchTime } from "@/lib/season-utils"
import type {
    MatchComponentProps,
    SvgWrapperProps
} from "@/components/playoff-brackets"
import type { BracketMatch } from "@/app/dashboard/playoffs/[seasonId]/actions"

const DoubleEliminationBracket = dynamic(
    () =>
        import("@/components/playoff-brackets").then(
            (mod) => mod.DoubleEliminationBracket
        ),
    { ssr: false }
)

// Must provide ALL properties — the library does NOT merge with defaults.
const BRACKET_STYLE = {
    width: 185,
    // Tall enough to fit header + 2 party rows + sets line + work line
    // without the work text bleeding past the card border on completed matches.
    boxHeight: 110,
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

type PathTint = "win" | "lose" | null
const PATH_TINT_BG: Record<"win" | "lose", string> = {
    win: "rgba(16, 185, 129, 0.22)",
    lose: "rgba(244, 63, 94, 0.22)"
}
// User-team highlight color (amber). Kept distinct from PATH_TINT_BG
// (green/red), from the winner highlight (--primary, purple), and from the
// dark-theme background hue (cool blue), so it reads in both modes.
const USER_TINT_BG = "rgba(245, 158, 11, 0.28)"
const USER_TINT_BORDER = "#f59e0b"
// Amber-600 — readable on the amber-tinted row in both light and dark modes.
const USER_TINT_TEXT = "#d97706"

function makeCustomMatch(
    userTeamId: number | null,
    anchorMatchNum: number | null,
    anchorWeek: number | null
) {
    return function CustomMatch(props: MatchComponentProps) {
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
        const isUserHome =
            !isBye && userTeamId !== null && bm.homeTeamId === userTeamId
        const isUserAway =
            !isBye && userTeamId !== null && bm.awayTeamId === userTeamId
        const isUserWork =
            !isBye && userTeamId !== null && bm.workTeamId === userTeamId
        const cardBorder =
            isUserHome || isUserAway || isUserWork
                ? `2px solid ${USER_TINT_BORDER}`
                : isBye
                  ? "1px dashed var(--border)"
                  : "1px solid var(--border)"

        // Same-evening one-level lookahead path tint.
        const pathApplies =
            !isBye &&
            anchorMatchNum !== null &&
            anchorWeek !== null &&
            bm.matchNum !== anchorMatchNum &&
            bm.week === anchorWeek
        const tintForRef = (
            refMatch: number | null,
            refIsWin: boolean | null
        ): PathTint => {
            if (!pathApplies) return null
            if (refMatch !== anchorMatchNum) return null
            return refIsWin ? "win" : "lose"
        }
        const homeTint: PathTint = isUserHome
            ? null
            : tintForRef(bm.homeSourceRefMatch, bm.homeSourceRefIsWin)
        const awayTint: PathTint = isUserAway
            ? null
            : tintForRef(bm.awaySourceRefMatch, bm.awaySourceRefIsWin)
        const workTint: PathTint = isUserWork
            ? null
            : tintForRef(bm.workSourceRefMatch, bm.workSourceRefIsWin)

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
                    border: cardBorder,
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
                                : bottomParty?.name &&
                                    bottomParty.name !== "BYE"
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
                                {bm.time ? ` ${formatMatchTime(bm.time)}` : ""}
                                {bm.court !== null ? ` Ct${bm.court}` : ""}
                            </span>
                        </div>

                        <PartyRow
                            name={topParty?.name || teamNameFallback}
                            resultText={topParty?.resultText ?? resultFallback}
                            won={topWon}
                            hovered={topHovered}
                            partyId={topParty?.id}
                            isUserTeam={isUserHome}
                            pathTint={homeTint}
                            onMouseEnter={onMouseEnter}
                            onMouseLeave={onMouseLeave}
                        />
                        <PartyRow
                            name={bottomParty?.name || teamNameFallback}
                            resultText={
                                bottomParty?.resultText ?? resultFallback
                            }
                            won={bottomWon}
                            hovered={bottomHovered}
                            partyId={bottomParty?.id}
                            isUserTeam={isUserAway}
                            pathTint={awayTint}
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

                        {bm.workTeamLabel && (
                            <div
                                style={{
                                    fontSize: "9px",
                                    color: isUserWork
                                        ? USER_TINT_TEXT
                                        : "var(--muted-foreground)",
                                    fontWeight: isUserWork ? 600 : 400,
                                    padding: "2px 6px",
                                    borderTop: "1px solid var(--border)",
                                    backgroundColor: isUserWork
                                        ? USER_TINT_BG
                                        : workTint
                                          ? PATH_TINT_BG[workTint]
                                          : "transparent",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                }}
                            >
                                Work: {bm.workTeamLabel}
                            </div>
                        )}
                    </>
                )}
            </div>
        )
    }
}

function PartyRow({
    name,
    resultText,
    won,
    hovered,
    partyId,
    isUserTeam,
    pathTint,
    onMouseEnter,
    onMouseLeave
}: {
    name: string
    resultText: string | null | undefined
    won: boolean
    hovered: boolean
    partyId?: string | number
    isUserTeam?: boolean
    pathTint?: PathTint
    onMouseEnter?: (partyId: string | number) => void
    onMouseLeave?: () => void
}) {
    const baseBg = hovered
        ? "rgba(16, 185, 129, 0.15)"
        : isUserTeam
          ? USER_TINT_BG
          : pathTint
            ? PATH_TINT_BG[pathTint]
            : won
              ? "color-mix(in srgb, var(--primary) 12%, transparent)"
              : "transparent"
    return (
        // biome-ignore lint/a11y: decorative hover highlight inside SVG bracket
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "3px 6px",
                backgroundColor: baseBg,
                fontWeight: won || hovered || isUserTeam ? 600 : 400,
                color: hovered
                    ? "#059669"
                    : isUserTeam
                      ? USER_TINT_TEXT
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
    matches,
    userTeamId = null,
    anchorMatchNum = null,
    anchorWeek = null
}: {
    matches: { upper: BracketMatch[]; lower: BracketMatch[] }
    userTeamId?: number | null
    anchorMatchNum?: number | null
    anchorWeek?: number | null
}) {
    const svgWrapper = useCallback(
        (props: SvgWrapperProps) => <ScrollWrapper {...props} />,
        []
    )
    const matchComponent = useMemo(
        () => makeCustomMatch(userTeamId, anchorMatchNum, anchorWeek),
        [userTeamId, anchorMatchNum, anchorWeek]
    )

    return (
        <div className="w-full rounded-lg border bg-muted/20">
            <DoubleEliminationBracket
                // biome-ignore lint: library types don't match our extended BracketMatch
                matches={matches as any}
                matchComponent={matchComponent}
                svgWrapper={svgWrapper}
                options={{ style: BRACKET_STYLE }}
            />
        </div>
    )
}
