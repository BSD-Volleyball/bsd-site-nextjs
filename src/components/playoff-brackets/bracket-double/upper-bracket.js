import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime"
import MatchWrapper from "../core/match-wrapper"
import { getPreviousMatches } from "../core/match-functions"
import { calculatePositionOfMatchUpperBracket } from "./calculate-match-position"
import ConnectorsUpper from "./upper-connectors"
const UpperBracket = ({
    columns,
    calculatedStyles,
    gameHeight,
    gameWidth,
    onMatchClick,
    onPartyClick,
    matchComponent
}) => {
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
            return _jsxs(
                "g",
                {
                    children: [
                        columnIndex !== 0 &&
                            _jsx(
                                ConnectorsUpper,
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
                                        style: calculatedStyles
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
export default UpperBracket
//# sourceMappingURL=upper-bracket.js.map
