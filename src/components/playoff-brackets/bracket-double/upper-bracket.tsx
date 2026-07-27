import type { ComponentType } from "react"
import MatchWrapper from "../core/match-wrapper"
import { getPreviousMatches } from "../core/match-functions"
import type {
    CalculatedStyles,
    Match,
    MatchClickHandler,
    MatchComponentProps,
    PartyClickHandler
} from "../types"
import { calculatePositionOfMatchUpperBracket } from "./calculate-match-position"
import ConnectorsUpper from "./upper-connectors"

interface UpperBracketProps<M extends Match> {
    columns: M[][]
    calculatedStyles: CalculatedStyles
    gameHeight: number
    gameWidth: number
    onMatchClick?: MatchClickHandler
    onPartyClick?: PartyClickHandler
    matchComponent?: ComponentType<MatchComponentProps<M>>
}

const UpperBracket = <M extends Match>({
    columns,
    calculatedStyles,
    gameHeight,
    gameWidth,
    onMatchClick,
    onPartyClick,
    matchComponent
}: UpperBracketProps<M>) => {
    const { canvasPadding, columnWidth, rowHeight, roundHeader } =
        calculatedStyles
    return columns.map((matchesColumn, columnIndex) =>
        matchesColumn.map((match, rowIndex) => {
            const { x, y } = calculatePositionOfMatchUpperBracket(
                rowIndex,
                columnIndex,
                {
                    canvasPadding,
                    columnWidth,
                    rowHeight
                }
            )
            const previousBottomPosition = (rowIndex + 1) * 2 - 1
            const { previousTopMatch, previousBottomMatch } =
                getPreviousMatches(columnIndex, columns, previousBottomPosition)
            return (
                <g key={x + y}>
                    {columnIndex !== 0 && (
                        <ConnectorsUpper
                            bracketSnippet={{
                                currentMatch: match,
                                previousTopMatch,
                                previousBottomMatch
                            }}
                            rowIndex={rowIndex}
                            columnIndex={columnIndex}
                            gameHeight={gameHeight}
                            gameWidth={gameWidth}
                            style={calculatedStyles}
                        />
                    )}
                    <g>
                        <MatchWrapper
                            x={x}
                            y={
                                y +
                                (roundHeader.isShown
                                    ? roundHeader.height +
                                      roundHeader.marginBottom
                                    : 0)
                            }
                            rowIndex={rowIndex}
                            columnIndex={columnIndex}
                            match={match}
                            previousBottomMatch={previousBottomMatch}
                            topText={match.startTime}
                            bottomText={match.name}
                            teams={match.participants}
                            onMatchClick={onMatchClick}
                            onPartyClick={onPartyClick}
                            style={calculatedStyles}
                            matchComponent={matchComponent}
                        />
                    </g>
                </g>
            )
        })
    )
}
export default UpperBracket
