import type { ComponentType, Dispatch, ReactNode } from "react"

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

export interface MatchParticipant {
    id: string | number
    name: string
    resultText: string | null
    isWinner: boolean
    status: "PLAYED" | "NO_SHOW" | "WALK_OVER" | "NO_PARTY" | null
}

export interface Match {
    id: number | string
    name: string
    nextMatchId: number | string | null
    nextLooserMatchId: number | string | null
    tournamentRoundText: string
    startTime: string
    state: string
    participants: MatchParticipant[]
}

/** An x/y coordinate inside the bracket SVG canvas. */
export interface Position {
    x: number
    y: number
}

/**
 * The current match plus its two feeder matches, used for connector
 * highlighting. `previousTopMatch`/`previousBottomMatch` may be `false`
 * because they are produced by `columnIndex !== 0 && ...` expressions.
 */
export interface BracketSnippet<M extends Match = Match> {
    currentMatch?: M | null
    previousTopMatch?: M | false | null
    previousBottomMatch?: M | false | null
}

// ---------------------------------------------------------------------------
// Theme / style model
// ---------------------------------------------------------------------------

export interface RoundHeaderTheme {
    isShown: boolean
    height: number
    marginBottom: number
    fontSize: number
    fontColor: string
    backgroundColor: string
    fontFamily: string
    roundTextGenerator:
        | ((currentRoundNumber: number, roundsTotalNumber: number) => string)
        | undefined
}

export interface LineInfo {
    separation: number
    homeVisitorSpread: number
}

/** The fully-resolved theme (every property present). */
export interface BracketTheme {
    width: number
    boxHeight: number
    canvasPadding: number
    spaceBetweenColumns: number
    spaceBetweenRows: number
    connectorColor: string
    connectorColorHighlight: string
    roundHeader: RoundHeaderTheme
    roundSeparatorWidth: number
    lineInfo: LineInfo
    horizontalOffset: number
    wonBywalkOverText: string
    lostByNoShowText: string
}

/** Theme with derived layout metrics appended by `getCalculatedStyles`. */
export interface CalculatedStyles extends BracketTheme {
    rowHeight: number
    columnWidth: number
}

/** Consumer-facing theme overrides (merged over `defaultStyle`). */
export interface BracketStyle {
    width?: number
    boxHeight?: number
    canvasPadding?: number
    spaceBetweenColumns?: number
    spaceBetweenRows?: number
    connectorColor?: string
    connectorColorHighlight?: string
    roundHeader?: Partial<RoundHeaderTheme>
    roundSeparatorWidth?: number
    lineInfo?: Partial<LineInfo>
    horizontalOffset?: number
    wonBywalkOverText?: string
    lostByNoShowText?: string
}

// ---------------------------------------------------------------------------
// Component contracts
// ---------------------------------------------------------------------------

export type MatchClickHandler = (...args: unknown[]) => void
export type PartyClickHandler = (...args: unknown[]) => void

/**
 * Party data handed to a custom match component. Always an object at
 * runtime, but every field may be absent for placeholder/TBD slots.
 */
export interface MatchComponentParty {
    id?: string | number
    name?: string
    resultText?: string | null
}

export interface MatchComponentProps<M extends Match = Match> {
    match: M
    onMatchClick?: MatchClickHandler
    onPartyClick?: PartyClickHandler
    onMouseEnter?: (partyId: string | number) => void
    onMouseLeave?: () => void
    topParty?: MatchComponentParty
    bottomParty?: MatchComponentParty
    topWon: boolean
    bottomWon: boolean
    topHovered: boolean
    bottomHovered: boolean
    topText: string
    bottomText: string
    connectorColor?: string
    computedStyles?: CalculatedStyles
    /** Not supplied by the current match wrapper; kept for compatibility. */
    teamNameFallback?: string
    /** Not supplied by the current match wrapper; kept for compatibility. */
    resultFallback?: string
}

export interface SvgWrapperProps {
    bracketWidth?: number
    bracketHeight?: number
    startAt?: number[]
    children?: ReactNode
}

export interface DoubleEliminationBracketProps<M extends Match = Match> {
    matches: { upper: M[]; lower: M[] }
    matchComponent: ComponentType<MatchComponentProps<M>>
    svgWrapper?: ComponentType<SvgWrapperProps>
    currentRound?: number
    onMatchClick?: MatchClickHandler
    onPartyClick?: PartyClickHandler
    options?: {
        style?: BracketStyle
    }
}

export interface SingleEliminationBracketProps<M extends Match = Match> {
    matches: M[]
    matchComponent: ComponentType<MatchComponentProps<M>>
    svgWrapper?: ComponentType<SvgWrapperProps>
    currentRound?: number
    onMatchClick?: MatchClickHandler
    onPartyClick?: PartyClickHandler
    options?: {
        style?: BracketStyle
    }
}

// ---------------------------------------------------------------------------
// Hover-highlight context store
// ---------------------------------------------------------------------------

export interface MatchHighlightState {
    hoveredMatchId: string | number | null | undefined
    hoveredPartyId: string | number | null | undefined
    hoveredColumnIndex: number | null | undefined
    hoveredRowIndex: number | null | undefined
}

export interface HoveredPartyPayload {
    partyId: string | number
    matchId: string | number
    columnIndex: number
    rowIndex: number
}

export type MatchContextAction = {
    type: "SET_HOVERED_PARTYID"
    payload: HoveredPartyPayload | null
}

export interface MatchContextValue {
    state: MatchHighlightState
    dispatch: Dispatch<MatchContextAction>
}
