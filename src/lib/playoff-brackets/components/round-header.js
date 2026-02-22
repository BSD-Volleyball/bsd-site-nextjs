import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime"
export default function RoundHeader({
    x,
    y = 0,
    width,
    roundHeader,
    canvasPadding,
    numOfRounds,
    tournamentRoundText,
    columnIndex
}) {
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
    return _jsxs("g", {
        children: [
            _jsx("rect", {
                x: x,
                y: y + canvasPadding,
                width: width,
                height: roundHeader.height,
                fill: roundHeader.backgroundColor,
                rx: "3",
                ry: "3"
            }),
            _jsx(
                "text",
                Object.assign(
                    {
                        x: x + width / 2,
                        y: y + canvasPadding + roundHeader.height / 2,
                        style: {
                            fontFamily: roundHeader.fontFamily,
                            fontSize: `${roundHeader.fontSize}px`,
                            color: roundHeader.fontColor
                        },
                        fill: "currentColor",
                        dominantBaseline: "middle",
                        textAnchor: "middle"
                    },
                    { children: roundLabel }
                )
            )
        ]
    })
}
//# sourceMappingURL=round-header.js.map
