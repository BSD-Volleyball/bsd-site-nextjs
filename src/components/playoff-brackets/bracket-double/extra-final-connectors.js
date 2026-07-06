import { jsx as _jsx } from "react/jsx-runtime"
import Connector from "../components/connector"
import { getCalculatedStyles } from "../settings"
import { calculatePositionOfFinalGame } from "./calculate-match-position"
const FinalConnectors = ({
    rowIndex,
    columnIndex,
    style,
    bracketSnippet = null,
    offsetY = 0,
    numOfLowerRounds,
    lowerBracketHeight,
    upperBracketHeight,
    gameHeight
}) => {
    const { columnWidth, rowHeight, canvasPadding } = getCalculatedStyles(style)
    const currentMatchPosition = calculatePositionOfFinalGame(
        rowIndex,
        columnIndex,
        {
            canvasPadding,
            rowHeight,
            columnWidth,
            offsetY,
            lowerBracketHeight,
            upperBracketHeight,
            gameHeight
        }
    )
    const previousBottomMatchPosition = calculatePositionOfFinalGame(
        0,
        numOfLowerRounds,
        {
            canvasPadding,
            rowHeight,
            columnWidth,
            offsetY,
            lowerBracketHeight,
            upperBracketHeight,
            gameHeight
        }
    )
    return _jsx(Connector, {
        bracketSnippet: bracketSnippet,
        previousBottomMatchPosition: previousBottomMatchPosition,
        currentMatchPosition: currentMatchPosition,
        style: style
    })
}
export default FinalConnectors
//# sourceMappingURL=extra-final-connectors.js.map
