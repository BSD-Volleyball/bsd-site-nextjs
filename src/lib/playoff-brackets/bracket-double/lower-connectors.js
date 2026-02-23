import { jsx as _jsx } from "react/jsx-runtime"
import Connectors from "../components/connector"
import { getCalculatedStyles } from "../settings"
import { calculatePositionOfMatchLowerBracket } from "./calculate-match-position"
const ConnectorsLower = ({
    bracketSnippet,
    rowIndex,
    columnIndex,
    style,
    offsetY = 0,
    firstRoundMatchCount = 0
}) => {
    const { columnWidth, rowHeight, canvasPadding } = getCalculatedStyles(style)
    const currentMatchPosition = calculatePositionOfMatchLowerBracket(
        rowIndex,
        columnIndex,
        {
            canvasPadding,
            rowHeight,
            columnWidth,
            offsetY,
            firstRoundMatchCount
        }
    )
    const previousBottomPosition = (rowIndex + 1) * 2 - 1
    const previousTopMatchPosition =
        bracketSnippet.previousTopMatch &&
        calculatePositionOfMatchLowerBracket(
            previousBottomPosition - 1,
            columnIndex - 1,
            {
                canvasPadding,
                rowHeight,
                columnWidth,
                offsetY,
                firstRoundMatchCount
            }
        )
    const previousBottomMatchPosition =
        bracketSnippet.previousBottomMatch &&
        calculatePositionOfMatchLowerBracket(
            previousBottomPosition,
            columnIndex - 1,
            {
                canvasPadding,
                rowHeight,
                columnWidth,
                offsetY,
                firstRoundMatchCount
            }
        )
    return _jsx(Connectors, {
        bracketSnippet: bracketSnippet,
        previousBottomMatchPosition: previousBottomMatchPosition,
        previousTopMatchPosition: previousTopMatchPosition,
        currentMatchPosition: currentMatchPosition,
        style: style
    })
}
export default ConnectorsLower
//# sourceMappingURL=lower-connectors.js.map
