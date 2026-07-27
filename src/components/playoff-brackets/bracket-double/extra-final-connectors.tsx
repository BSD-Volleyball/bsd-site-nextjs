import Connector from "../components/connector"
import { getCalculatedStyles } from "../settings"
import type { BracketSnippet, CalculatedStyles } from "../types"
import { calculatePositionOfFinalGame } from "./calculate-match-position"

interface ExtraFinalConnectorsProps {
    rowIndex: number
    columnIndex: number
    style: CalculatedStyles
    bracketSnippet?: BracketSnippet | null
    offsetY?: number
    numOfUpperRounds?: number
    numOfLowerRounds: number
    lowerBracketHeight: number
    upperBracketHeight: number
    gameHeight: number
    gameWidth?: number
}

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
}: ExtraFinalConnectorsProps) => {
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
    return (
        <Connector
            bracketSnippet={bracketSnippet}
            previousBottomMatchPosition={previousBottomMatchPosition}
            currentMatchPosition={currentMatchPosition}
            style={style}
        />
    )
}
export default FinalConnectors
