import type { RoundHeaderTheme } from "../types"

interface RoundHeaderProps {
    x: number
    y?: number
    width: number
    roundHeader: RoundHeaderTheme
    canvasPadding: number
    numOfRounds: number
    tournamentRoundText: string
    columnIndex: number
}

export default function RoundHeader({
    x,
    y = 0,
    width,
    roundHeader,
    canvasPadding,
    numOfRounds,
    tournamentRoundText,
    columnIndex
}: RoundHeaderProps) {
    const roundLabel =
        !roundHeader.roundTextGenerator && columnIndex + 1 === numOfRounds
            ? "Final"
            : !roundHeader.roundTextGenerator &&
                columnIndex + 1 === numOfRounds - 1
              ? "Semi-final"
              : !roundHeader.roundTextGenerator &&
                  columnIndex + 1 < numOfRounds - 1
                ? `Round ${tournamentRoundText}`
                : roundHeader.roundTextGenerator
                  ? roundHeader.roundTextGenerator(columnIndex + 1, numOfRounds)
                  : ""
    return (
        <g>
            <rect
                x={x}
                y={y + canvasPadding}
                width={width}
                height={roundHeader.height}
                fill={roundHeader.backgroundColor}
                rx="3"
                ry="3"
            />
            <text
                x={x + width / 2}
                y={y + canvasPadding + roundHeader.height / 2}
                style={{
                    fontFamily: roundHeader.fontFamily,
                    fontSize: `${roundHeader.fontSize}px`,
                    color: roundHeader.fontColor
                }}
                fill="currentColor"
                dominantBaseline="middle"
                textAnchor="middle"
            >
                {roundLabel}
            </text>
        </g>
    )
}
