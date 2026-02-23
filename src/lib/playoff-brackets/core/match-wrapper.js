import { jsx as _jsx } from "react/jsx-runtime"
import { useContext } from "react"
import { defaultStyle, getCalculatedStyles } from "../settings"
import { sortTeamsSeedOrder } from "./match-functions"
import { matchContext } from "./match-context"
import { MATCH_STATES } from "./match-states"

function Match({
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
}) {
    const {
        state: { hoveredPartyId },
        dispatch
    } = useContext(matchContext)

    const computedStyles = getCalculatedStyles(style)
    const { width = 300, boxHeight = 70, connectorColor } = computedStyles

    const sortedTeams = [...teams].sort(sortTeamsSeedOrder(previousBottomMatch))
    const topParty = sortedTeams[0] ? { ...sortedTeams[0] } : {}
    const bottomParty = sortedTeams[1] ? { ...sortedTeams[1] } : {}

    const topHovered =
        !Number.isNaN(hoveredPartyId) &&
        topParty?.id !== undefined &&
        hoveredPartyId === topParty.id
    const bottomHovered =
        !Number.isNaN(hoveredPartyId) &&
        bottomParty?.id !== undefined &&
        hoveredPartyId === bottomParty.id

    const participantWalkedOver = (participant) =>
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

    const matchState = MATCH_STATES[match.state]
    const teamNameFallbackByState = {
        [MATCH_STATES.WALK_OVER]: "",
        [MATCH_STATES.NO_SHOW]: "",
        [MATCH_STATES.DONE]: "",
        [MATCH_STATES.SCORE_DONE]: "",
        [MATCH_STATES.NO_PARTY]: ""
    }
    const teamNameFallback = teamNameFallbackByState[matchState] ?? "TBD"

    const resultFallback = (participant) => {
        if (participant.status) {
            const fallbackByStatus = {
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

    const onMouseEnter = (partyId) => {
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

    return _jsx("g", {
        transform: `translate(${x}, ${y})`,
        ...rest,
        children: _jsx("svg", {
            width,
            height: boxHeight,
            viewBox: `0 0 ${width} ${boxHeight}`,
            children: _jsx("foreignObject", {
                x: 0,
                y: 0,
                width,
                height: boxHeight,
                children:
                    MatchComponent &&
                    _jsx(MatchComponent, {
                        match,
                        onMatchClick,
                        onPartyClick,
                        onMouseEnter,
                        onMouseLeave,
                        topParty,
                        bottomParty,
                        topWon,
                        bottomWon,
                        topHovered,
                        bottomHovered,
                        topText,
                        bottomText,
                        connectorColor,
                        computedStyles
                    })
            })
        })
    })
}

export default Match
//# sourceMappingURL=match-wrapper.js.map
