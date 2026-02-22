import type { ComponentType, ReactNode } from "react"
import DoubleEliminationBracketImpl from "./bracket-double/double-elim-bracket"
import { MATCH_STATES } from "./core/match-states"

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
    [key: string]: unknown
}

export interface SvgWrapperProps {
    bracketWidth?: number
    bracketHeight?: number
    startAt?: number[]
    children?: ReactNode
}

export interface MatchComponentProps {
    match: Match
    onMatchClick?: (...args: unknown[]) => void
    onPartyClick?: (...args: unknown[]) => void
    onMouseEnter?: (match: Match) => void
    onMouseLeave?: (match: Match) => void
    topParty?: { name?: string; resultText?: string | null }
    bottomParty?: { name?: string; resultText?: string | null }
    topWon: boolean
    bottomWon: boolean
    topText: string
    bottomText: string
    connectorColor?: string
    computedStyles?: unknown
    teamNameFallback: string
    resultFallback: string
}

export interface BracketStyle {
    width?: number
    boxHeight?: number
    canvasPadding?: number
    spaceBetweenColumns?: number
    spaceBetweenRows?: number
    connectorColor?: string
    connectorColorHighlight?: string
    roundHeader?: {
        isShown?: boolean
        height?: number
        marginBottom?: number
        fontSize?: number
        fontColor?: string
        backgroundColor?: string
        fontFamily?: string
        roundTextGenerator?:
            | ((round: number, totalRounds: number) => string)
            | undefined
    }
    roundSeparatorWidth?: number
    lineInfo?: {
        separation?: number
        homeVisitorSpread?: number
    }
    horizontalOffset?: number
    wonBywalkOverText?: string
    lostByNoShowText?: string
}

export interface DoubleEliminationBracketProps {
    matches: { upper: Match[]; lower: Match[] }
    matchComponent: ComponentType<MatchComponentProps>
    svgWrapper?: ComponentType<SvgWrapperProps>
    currentRound?: number
    onMatchClick?: (...args: unknown[]) => void
    onPartyClick?: (...args: unknown[]) => void
    options?: {
        style?: BracketStyle
    }
}

export const DoubleEliminationBracket =
    DoubleEliminationBracketImpl as ComponentType<DoubleEliminationBracketProps>

export { MATCH_STATES }
export default DoubleEliminationBracket
