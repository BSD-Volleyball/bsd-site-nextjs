import { jsx as _jsx } from "react/jsx-runtime"
import Connector from "../components/connector"
import { getCalculatedStyles } from "../settings"
import {
    calculatePositionOfMatchUpperBracket,
    calculatePositionOfMatchLowerBracket,
    calculatePositionOfFinalGame
} from "./calculate-match-position"
const FinalConnectors = ({
    rowIndex,
    columnIndex,
    style,
    bracketSnippet = null,
    offsetY = 0,
    numOfUpperRounds,
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
    const previousTopMatchPosition = calculatePositionOfMatchUpperBracket(
        0,
        numOfUpperRounds - 1,
        {
            canvasPadding,
            rowHeight,
            columnWidth,
            offsetY
        }
    )
    const previousBottomMatchPosition = calculatePositionOfMatchLowerBracket(
        0,
        numOfLowerRounds - 1,
        {
            canvasPadding,
            rowHeight,
            columnWidth,
            offsetY: upperBracketHeight + offsetY
        }
    )
    return _jsx(Connector, {
        bracketSnippet: bracketSnippet,
        previousBottomMatchPosition: previousBottomMatchPosition,
        previousTopMatchPosition: previousTopMatchPosition,
        currentMatchPosition: currentMatchPosition,
        style: style
    })
}
export default FinalConnectors
//# sourceMappingURL=final-connectors.js.map
