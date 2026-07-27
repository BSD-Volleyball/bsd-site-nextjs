import type { ComponentType } from "react"
import MatchWrapper from "../core/match-wrapper"
import type {
    BracketSnippet,
    CalculatedStyles,
    Match,
    MatchClickHandler,
    MatchComponentProps,
    PartyClickHandler
} from "../types"
import { calculatePositionOfFinalGame } from "./calculate-match-position"
import Connectors from "./extra-final-connectors"

interface ExtraFinalProps<M extends Match> {
    match: M
    rowIndex: number
    columnIndex: number
    gameHeight: number
    gameWidth: number
    calculatedStyles: CalculatedStyles
    onMatchClick?: MatchClickHandler
    onPartyClick?: PartyClickHandler
    matchComponent?: ComponentType<MatchComponentProps<M>>
    bracketSnippet: BracketSnippet<M>
    numOfUpperRounds: number
    numOfLowerRounds: number
    upperBracketHeight: number
    lowerBracketHeight: number
}

const ExtraFinal = <M extends Match>({
    match,
    rowIndex,
    columnIndex,
    gameHeight,
    gameWidth,
    calculatedStyles,
    onMatchClick,
    onPartyClick,
    matchComponent,
    bracketSnippet,
    numOfUpperRounds,
    numOfLowerRounds,
    upperBracketHeight,
    lowerBracketHeight
}: ExtraFinalProps<M>) => {
    const { canvasPadding, columnWidth, rowHeight, roundHeader } =
        calculatedStyles
    const { x, y } = calculatePositionOfFinalGame(rowIndex, columnIndex, {
        canvasPadding,
        columnWidth,
        rowHeight,
        gameHeight,
        upperBracketHeight,
        lowerBracketHeight
    })
    return (
        <>
            {columnIndex !== 0 && (
                <Connectors
                    numOfUpperRounds={numOfUpperRounds}
                    numOfLowerRounds={numOfLowerRounds}
                    rowIndex={rowIndex}
                    columnIndex={columnIndex}
                    gameWidth={gameWidth}
                    gameHeight={gameHeight}
                    lowerBracketHeight={lowerBracketHeight}
                    upperBracketHeight={upperBracketHeight}
                    style={calculatedStyles}
                    bracketSnippet={bracketSnippet}
                />
            )}
            <g>
                <MatchWrapper
                    x={x}
                    y={
                        y +
                        (roundHeader.isShown
                            ? roundHeader.height + roundHeader.marginBottom
                            : 0)
                    }
                    rowIndex={rowIndex}
                    columnIndex={columnIndex}
                    match={match}
                    previousBottomMatch={bracketSnippet.previousBottomMatch}
                    topText={match.startTime}
                    bottomText={match.name}
                    teams={match.participants}
                    onMatchClick={onMatchClick}
                    onPartyClick={onPartyClick}
                    style={calculatedStyles}
                    matchComponent={matchComponent}
                />
            </g>
        </>
    )
}
export default ExtraFinal
