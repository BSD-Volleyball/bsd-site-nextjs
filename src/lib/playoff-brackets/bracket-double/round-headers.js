import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime"
import RoundHeader from "../components/round-header"
import { calculatePositionOfMatchLowerBracket } from "./calculate-match-position"
function RoundHeaders({
    numOfRounds,
    calculatedStyles: {
        canvasPadding,
        columnWidth,
        rowHeight,
        roundHeader,
        width
    }
}) {
    return _jsx(_Fragment, {
        children: [...new Array(numOfRounds)].map(
            (_matchesColumn, columnIndex) => {
                const { x } = calculatePositionOfMatchLowerBracket(
                    0,
                    columnIndex,
                    {
                        canvasPadding,
                        columnWidth,
                        rowHeight
                    }
                )
                return _jsx(
                    "g",
                    {
                        children:
                            roundHeader.isShown &&
                            _jsx(RoundHeader, {
                                x: x,
                                roundHeader: roundHeader,
                                canvasPadding: canvasPadding,
                                width: width,
                                numOfRounds: numOfRounds,
                                tournamentRoundText: (
                                    columnIndex + 1
                                ).toString(),
                                columnIndex: columnIndex
                            })
                    },
                    `round ${x}`
                )
            }
        )
    })
}
export default RoundHeaders
//# sourceMappingURL=round-headers.js.map
