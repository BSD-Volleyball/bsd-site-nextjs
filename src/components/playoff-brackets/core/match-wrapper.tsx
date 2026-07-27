import { useContext } from "react"
import type { ComponentType } from "react"
import { defaultStyle, getCalculatedStyles } from "../settings"
import type {
    BracketTheme,
    Match as MatchType,
    MatchClickHandler,
    MatchComponentProps,
    MatchParticipant,
    PartyClickHandler
} from "../types"
import { matchContext } from "./match-context"
import { sortTeamsSeedOrder } from "./match-functions"
import { MATCH_STATES } from "./match-states"

// React forwards unknown lowercase attributes to the DOM; the xmlns
// declaration is required for the foreignObject HTML island. Spread via a
// variable because React's div prop types do not declare `xmlns`.
const xhtmlNamespace = { xmlns: "http://www.w3.org/1999/xhtml" }

interface MatchWrapperProps<M extends MatchType> {
    rowIndex: number
    columnIndex: number
    match: M
    previousBottomMatch?: MatchType | false | null
    teams: MatchParticipant[]
    topText: string
    bottomText: string
    style?: BracketTheme
    matchComponent?: ComponentType<MatchComponentProps<M>>
    onMatchClick?: MatchClickHandler
    onPartyClick?: PartyClickHandler
    x?: number
    y?: number
}

function Match<M extends MatchType>({
    rowIndex,
    columnIndex,
    match,
    previousBottomMatch = null,
    teams,
    topText,
    bottomText,
    style = defaultStyle,
    matchComponent: MatchComponent,
    onMatchClick,
    onPartyClick,
    x = 0,
    y = 0,
    ...rest
}: MatchWrapperProps<M>) {
    const {
        state: { hoveredPartyId },
        dispatch
    } = useContext(matchContext)

    const computedStyles = getCalculatedStyles(style)
    const { width = 300, boxHeight = 70, connectorColor } = computedStyles

    const sortedTeams = [...teams].sort(sortTeamsSeedOrder(previousBottomMatch))
    const topParty: Partial<MatchParticipant> = sortedTeams[0]
        ? { ...sortedTeams[0] }
        : {}
    const bottomParty: Partial<MatchParticipant> = sortedTeams[1]
        ? { ...sortedTeams[1] }
        : {}

    const topHovered =
        !Number.isNaN(hoveredPartyId) &&
        topParty?.id !== undefined &&
        hoveredPartyId === topParty.id
    const bottomHovered =
        !Number.isNaN(hoveredPartyId) &&
        bottomParty?.id !== undefined &&
        hoveredPartyId === bottomParty.id

    const participantWalkedOver = (participant: Partial<MatchParticipant>) =>
        match.state === MATCH_STATES.WALK_OVER &&
        teams.filter((team) => Boolean(team.id)).length < 2 &&
        Boolean(participant.id)

    const topWon =
        topParty.status === MATCH_STATES.WALK_OVER ||
        participantWalkedOver(topParty) ||
        Boolean(topParty.isWinner)
    const bottomWon =
        bottomParty.status === MATCH_STATES.WALK_OVER ||
        participantWalkedOver(bottomParty) ||
        Boolean(bottomParty.isWinner)

    const matchStateLookup: Record<string, string> = MATCH_STATES
    const matchState = matchStateLookup[match.state]
    const teamNameFallbackByState: Record<string, string | undefined> = {
        [MATCH_STATES.WALK_OVER]: "",
        [MATCH_STATES.NO_SHOW]: "",
        [MATCH_STATES.DONE]: "",
        [MATCH_STATES.SCORE_DONE]: "",
        [MATCH_STATES.NO_PARTY]: ""
    }
    const teamNameFallback = teamNameFallbackByState[matchState] ?? "TBD"

    const resultFallback = (participant: Partial<MatchParticipant>): string => {
        if (participant.status) {
            const fallbackByStatus: Record<string, string | undefined> = {
                WALKOVER: computedStyles.wonBywalkOverText,
                [MATCH_STATES.WALK_OVER]: computedStyles.wonBywalkOverText,
                [MATCH_STATES.NO_SHOW]: computedStyles.lostByNoShowText,
                [MATCH_STATES.NO_PARTY]: ""
            }
            return fallbackByStatus[participant.status] ?? ""
        }

        if (participantWalkedOver(participant)) {
            return computedStyles.wonBywalkOverText
        }

        return ""
    }

    const onMouseEnter = (partyId: string | number) => {
        dispatch({
            type: "SET_HOVERED_PARTYID",
            payload: {
                partyId,
                matchId: match.id,
                rowIndex,
                columnIndex
            }
        })
    }

    const onMouseLeave = () => {
        dispatch({ type: "SET_HOVERED_PARTYID", payload: null })
    }

    bottomParty.name = bottomParty.name || teamNameFallback
    bottomParty.resultText =
        bottomParty.resultText || resultFallback(bottomParty)
    topParty.name = topParty.name || teamNameFallback
    topParty.resultText = topParty.resultText || resultFallback(topParty)

    // BYE matches: render as pure SVG to avoid Safari foreignObject positioning bug
    const isBye = match.name === "BYE"
    if (isBye) {
        const byeTeamName =
            topParty.name && topParty.name !== "BYE"
                ? topParty.name
                : bottomParty.name && bottomParty.name !== "BYE"
                  ? bottomParty.name
                  : "TBD"
        return (
            <g transform={`translate(${x}, ${y})`} {...rest}>
                <rect
                    x={0}
                    y={0}
                    width={width}
                    height={boxHeight}
                    rx={4}
                    ry={4}
                    style={{
                        fill: "var(--muted)",
                        stroke: "var(--border)",
                        strokeWidth: 1,
                        strokeDasharray: "4 2",
                        opacity: 0.7
                    }}
                />
                <text
                    x={width / 2}
                    y={boxHeight / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                        fontSize: 10,
                        fill: "var(--muted-foreground)",
                        fontFamily: "system-ui, sans-serif"
                    }}
                >
                    {`${byeTeamName} (BYE)`}
                </text>
            </g>
        )
    }

    return (
        <g transform={`translate(${x}, ${y})`} {...rest}>
            <foreignObject x={0} y={0} width={width} height={boxHeight}>
                {MatchComponent && (
                    <div
                        {...xhtmlNamespace}
                        style={{
                            width: `${width}px`,
                            height: `${boxHeight}px`
                        }}
                    >
                        <MatchComponent
                            match={match}
                            onMatchClick={onMatchClick}
                            onPartyClick={onPartyClick}
                            onMouseEnter={onMouseEnter}
                            onMouseLeave={onMouseLeave}
                            topParty={topParty}
                            bottomParty={bottomParty}
                            topWon={topWon}
                            bottomWon={bottomWon}
                            topHovered={topHovered}
                            bottomHovered={bottomHovered}
                            topText={topText}
                            bottomText={bottomText}
                            connectorColor={connectorColor}
                            computedStyles={computedStyles}
                        />
                    </div>
                )}
            </foreignObject>
        </g>
    )
}

export default Match
