import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime"
import MatchWrapper from "../core/match-wrapper"
import { getPreviousMatches } from "../core/match-functions"
import { calculatePositionOfMatchLowerBracket } from "./calculate-match-position"
import ConnectorsLower from "./lower-connectors"
const LowerBracket = ({
    columns,
    calculatedStyles,
    gameHeight,
    gameWidth,
    onMatchClick,
    onPartyClick,
    matchComponent,
    upperBracketHeight
}) => {
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
            return _jsxs(
                "g",
                {
                    children: [
                        columnIndex !== 0 &&
                            _jsx(
                                ConnectorsLower,
                                Object.assign(
                                    {},
                                    {
                                        bracketSnippet: {
                                            currentMatch: match,
                                            previousTopMatch,
                                            previousBottomMatch
                                        },
                                        rowIndex,
                                        columnIndex,
                                        gameHeight,
                                        gameWidth,
                                        style: calculatedStyles,
                                        offsetY: upperBracketHeight,
                                        firstRoundMatchCount
                                    }
                                )
                            ),
                        _jsx("g", {
                            children: _jsx(MatchWrapper, {
                                x: x,
                                y:
                                    y +
                                    (roundHeader.isShown
                                        ? roundHeader.height +
                                          roundHeader.marginBottom
                                        : 0),
                                rowIndex: rowIndex,
                                columnIndex: columnIndex,
                                match: match,
                                previousBottomMatch: previousBottomMatch,
                                topText: match.startTime,
                                bottomText: match.name,
                                teams: match.participants,
                                onMatchClick: onMatchClick,
                                onPartyClick: onPartyClick,
                                style: calculatedStyles,
                                matchComponent: matchComponent
                            })
                        })
                    ]
                },
                x + y
            )
        })
    )
}
export default LowerBracket
//# sourceMappingURL=lower-bracket.js.map
