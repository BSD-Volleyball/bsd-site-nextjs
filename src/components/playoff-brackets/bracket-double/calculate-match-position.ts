import type { Position } from "../types"

interface VerticalPositioningArgs {
    rowIndex: number
    columnIndex: number
    rowHeight: number
}

interface FinalGamePositionOptions {
    canvasPadding: number
    rowHeight: number
    columnWidth: number
    gameHeight: number
    upperBracketHeight: number
    lowerBracketHeight: number
    offsetX?: number
    offsetY?: number
}

interface UpperBracketPositionOptions {
    canvasPadding: number
    rowHeight: number
    columnWidth: number
    offsetX?: number
    offsetY?: number
}

interface LowerBracketPositionOptions extends UpperBracketPositionOptions {
    firstRoundMatchCount?: number
}

export const calculateVerticalStartingPoint = (
    columnIndex: number,
    height: number
): number => 2 ** columnIndex * (height / 2) - height / 2
export const columnIncrement = (columnIndex: number, height: number): number =>
    2 ** columnIndex * height
export const calculateHeightIncrease = (
    columnIndex: number,
    rowIndex: number,
    height: number
): number => columnIncrement(columnIndex, height) * rowIndex
export const calculateVerticalPositioning = ({
    rowIndex,
    columnIndex,
    rowHeight: height
}: VerticalPositioningArgs): number => {
    return (
        calculateHeightIncrease(columnIndex, rowIndex, height) +
        calculateVerticalStartingPoint(columnIndex, height)
    )
}
export const calculatePositionOfFinalGame = (
    _rowIndex: number,
    columnIndex: number,
    {
        canvasPadding,
        rowHeight,
        columnWidth,
        gameHeight,
        upperBracketHeight,
        lowerBracketHeight,
        offsetX = 0,
        offsetY = 0
    }: FinalGamePositionOptions
): Position => {
    const yResult =
        gameHeight * (lowerBracketHeight / upperBracketHeight) - rowHeight
    return {
        x: columnIndex * columnWidth + canvasPadding + offsetX,
        y: yResult + canvasPadding + offsetY
    }
}
export const calculatePositionOfMatchUpperBracket = (
    rowIndex: number,
    columnIndex: number,
    {
        canvasPadding,
        rowHeight,
        columnWidth,
        offsetX = 0,
        offsetY = 0
    }: UpperBracketPositionOptions
): Position => {
    const yResult = calculateVerticalPositioning({
        rowHeight,
        rowIndex,
        columnIndex
    })
    const xResult = columnIndex * columnWidth
    return {
        x: xResult + canvasPadding + offsetX,
        y: yResult + canvasPadding + offsetY
    }
}
export const returnLowerBracketColumnIndex = (columnIndex: number): number =>
    Math.ceil(columnIndex / 2)
export const calculatePositionOfMatchLowerBracket = (
    rowIndex: number,
    columnIndex: number,
    {
        canvasPadding,
        rowHeight,
        columnWidth,
        offsetX = 0,
        offsetY = 0,
        firstRoundMatchCount = 0
    }: LowerBracketPositionOptions
): Position => {
    let effectiveDepth = returnLowerBracketColumnIndex(columnIndex)
    // Cap depth so matches don't spread wider than first-round count allows
    if (firstRoundMatchCount > 0) {
        const maxDepth = Math.floor(Math.log2(firstRoundMatchCount))
        effectiveDepth = Math.min(effectiveDepth, maxDepth)
    }
    const result = calculateVerticalPositioning({
        rowHeight,
        rowIndex,
        columnIndex: effectiveDepth
    })
    return {
        x: columnIndex * columnWidth + canvasPadding + offsetX,
        y: result + canvasPadding + offsetY
    }
}
