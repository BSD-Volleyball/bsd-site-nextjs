export const calculateVerticalStartingPoint = (columnIndex, height) =>
    2 ** columnIndex * (height / 2) - height / 2
export const columnIncrement = (columnIndex, height) =>
    2 ** columnIndex * height
export const calculateHeightIncrease = (columnIndex, rowIndex, height) =>
    columnIncrement(columnIndex, height) * rowIndex
export const calculateVerticalPositioning = ({
    rowIndex,
    columnIndex,
    rowHeight: height
}) => {
    return (
        calculateHeightIncrease(columnIndex, rowIndex, height) +
        calculateVerticalStartingPoint(columnIndex, height)
    )
}
export const calculatePositionOfFinalGame = (
    _rowIndex,
    columnIndex,
    {
        canvasPadding,
        rowHeight,
        columnWidth,
        gameHeight,
        upperBracketHeight,
        lowerBracketHeight,
        offsetX = 0,
        offsetY = 0
    }
) => {
    const yResult =
        gameHeight * (lowerBracketHeight / upperBracketHeight) - rowHeight
    return {
        x: columnIndex * columnWidth + canvasPadding + offsetX,
        y: yResult + canvasPadding + offsetY
    }
}
export const calculatePositionOfMatchUpperBracket = (
    rowIndex,
    columnIndex,
    { canvasPadding, rowHeight, columnWidth, offsetX = 0, offsetY = 0 }
) => {
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
export const returnLowerBracketColumnIndex = (columnIndex) =>
    Math.ceil(columnIndex / 2)
export const calculatePositionOfMatchLowerBracket = (
    rowIndex,
    columnIndex,
    {
        canvasPadding,
        rowHeight,
        columnWidth,
        offsetX = 0,
        offsetY = 0,
        firstRoundMatchCount = 0
    }
) => {
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
//# sourceMappingURL=calculate-match-position.js.map
