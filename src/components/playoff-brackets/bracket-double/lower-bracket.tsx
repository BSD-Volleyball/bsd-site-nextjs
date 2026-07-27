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
import { calculatePositionOfMatchLowerBracket } from "./calculate-match-position"
import ConnectorsLower from "./lower-connectors"

interface LowerBracketProps<M extends Match> {
    columns: M[][]
    calculatedStyles: CalculatedStyles
    gameHeight: number
    gameWidth: number
    onMatchClick?: MatchClickHandler
    onPartyClick?: PartyClickHandler
    matchComponent?: ComponentType<MatchComponentProps<M>>
    upperBracketHeight: number
}

const LowerBracket = <M extends Match>({
    columns,
    calculatedStyles,
    gameHeight,
    gameWidth,
    onMatchClick,
    onPartyClick,
    matchComponent,
    upperBracketHeight
}: LowerBracketProps<M>) => {
    const { canvasPadding, columnWidth, rowHeight, roundHeader } =
        calculatedStyles
    const firstRoundMatchCount = columns[0]?.length || 0
    return columns.map((matchesColumn, columnIndex) =>
        matchesColumn.map((match, rowIndex) => {
            const { x, y } = calculatePositionOfMatchLowerBracket(
                rowIndex,
                columnIndex,
                {
                    canvasPadding,
                    columnWidth,
                    rowHeight,
                    offsetY: upperBracketHeight,
                    firstRoundMatchCount
                }
            )
            const previousBottomPosition = (rowIndex + 1) * 2 - 1
            const { previousTopMatch, previousBottomMatch } =
                getPreviousMatches(columnIndex, columns, previousBottomPosition)
            return (
                <g key={x + y}>
                    {columnIndex !== 0 && (
                        <ConnectorsLower
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
                            offsetY={upperBracketHeight}
                            firstRoundMatchCount={firstRoundMatchCount}
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
export default LowerBracket
