declare module "@g-loot/react-tournament-brackets" {
    import type { ComponentType, ReactNode } from "react"

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

    export interface SVGViewerProps {
        width: number
        height: number
        background?: string
        SVGBackground?: string
        children?: ReactNode
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
        onMatchClick?: () => void
        onPartyClick?: (party: unknown, partyWon: boolean) => void
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

    export const DoubleEliminationBracket: ComponentType<{
        matches: { upper: Match[]; lower: Match[] }
        matchComponent: ComponentType<MatchComponentProps>
        svgWrapper?: ComponentType<SvgWrapperProps>
        options?: unknown
    }>

    export const SingleEliminationBracket: ComponentType<{
        matches: Match[]
        matchComponent: ComponentType<MatchComponentProps>
        svgWrapper?: ComponentType<SvgWrapperProps>
        options?: unknown
    }>

    export const SVGViewer: ComponentType<SVGViewerProps>

    export const Match: ComponentType<MatchComponentProps>

    export function createTheme(theme: unknown): unknown

    export const MATCH_STATES: {
        PLAYED: string
        NO_SHOW: string
        WALK_OVER: string
        NO_PARTY: string
        DONE: string
        SCORE_DONE: string
    }
}
