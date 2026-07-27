import type { RoundHeaderTheme } from "../types"

export function calculateSVGDimensions(
    numOfRows: number,
    numOfColumns: number,
    rowHeight: number,
    columnWidth: number,
    canvasPadding: number,
    roundHeader: RoundHeaderTheme,
    currentRound: string | number = ""
): { gameWidth: number; gameHeight: number; startPosition: number[] } {
    const bracketHeight = numOfRows * rowHeight
    const bracketWidth = numOfColumns * columnWidth
    const gameHeight =
        bracketHeight +
        canvasPadding * 2 +
        (roundHeader.isShown
            ? roundHeader.height + roundHeader.marginBottom
            : 0)
    const gameWidth = bracketWidth + canvasPadding * 2
    const startPosition = [
        currentRound
            ? -(
                  parseInt(String(currentRound), 10) * columnWidth -
                  canvasPadding * 2
              )
            : 0,
        0
    ]
    return { gameWidth, gameHeight, startPosition }
}
