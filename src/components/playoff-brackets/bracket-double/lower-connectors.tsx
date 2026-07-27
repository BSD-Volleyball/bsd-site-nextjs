import Connectors from "../components/connector"
import { getCalculatedStyles } from "../settings"
import type { BracketSnippet, CalculatedStyles } from "../types"
import { calculatePositionOfMatchLowerBracket } from "./calculate-match-position"

interface ConnectorsLowerProps {
    bracketSnippet: BracketSnippet
    rowIndex: number
    columnIndex: number
    style: CalculatedStyles
    offsetY?: number
    firstRoundMatchCount?: number
    gameHeight?: number
    gameWidth?: number
}

const ConnectorsLower = ({
    bracketSnippet,
    rowIndex,
    columnIndex,
    style,
    offsetY = 0,
    firstRoundMatchCount = 0
}: ConnectorsLowerProps) => {
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
    return (
        <Connectors
            bracketSnippet={bracketSnippet}
            previousBottomMatchPosition={previousBottomMatchPosition}
            previousTopMatchPosition={previousTopMatchPosition}
            currentMatchPosition={currentMatchPosition}
            style={style}
        />
    )
}
export default ConnectorsLower
