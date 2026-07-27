import Connector from "../components/connector"
import { getCalculatedStyles } from "../settings"
import type { BracketSnippet, CalculatedStyles } from "../types"
import {
    calculatePositionOfFinalGame,
    calculatePositionOfMatchLowerBracket,
    calculatePositionOfMatchUpperBracket
} from "./calculate-match-position"

interface FinalConnectorsProps {
    rowIndex: number
    columnIndex: number
    style: CalculatedStyles
    bracketSnippet?: BracketSnippet | null
    offsetY?: number
    numOfUpperRounds: number
    numOfLowerRounds: number
    lowerBracketHeight: number
    upperBracketHeight: number
    gameHeight: number
    gameWidth?: number
    firstRoundLowerMatchCount?: number
}

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
    gameHeight,
    firstRoundLowerMatchCount = 0
}: FinalConnectorsProps) => {
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
            offsetY: upperBracketHeight + offsetY,
            firstRoundMatchCount: firstRoundLowerMatchCount
        }
    )
    return (
        <Connector
            bracketSnippet={bracketSnippet}
            previousBottomMatchPosition={previousBottomMatchPosition}
            previousTopMatchPosition={previousTopMatchPosition}
            currentMatchPosition={currentMatchPosition}
            style={style}
        />
    )
}
export default FinalConnectors
