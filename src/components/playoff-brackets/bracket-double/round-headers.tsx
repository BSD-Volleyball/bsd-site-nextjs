import RoundHeader from "../components/round-header"
import type { CalculatedStyles } from "../types"
import { calculatePositionOfMatchLowerBracket } from "./calculate-match-position"

interface RoundHeadersProps {
    numOfRounds: number
    calculatedStyles: CalculatedStyles
}

function RoundHeaders({
    numOfRounds,
    calculatedStyles: {
        canvasPadding,
        columnWidth,
        rowHeight,
        roundHeader,
        width
    }
}: RoundHeadersProps) {
    return (
        <>
            {[...new Array<undefined>(numOfRounds)].map(
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
                    return (
                        <g key={`round ${x}`}>
                            {roundHeader.isShown && (
                                <RoundHeader
                                    x={x}
                                    roundHeader={roundHeader}
                                    canvasPadding={canvasPadding}
                                    width={width}
                                    numOfRounds={numOfRounds}
                                    tournamentRoundText={(
                                        columnIndex + 1
                                    ).toString()}
                                    columnIndex={columnIndex}
                                />
                            )}
                        </g>
                    )
                }
            )}
        </>
    )
}
export default RoundHeaders
