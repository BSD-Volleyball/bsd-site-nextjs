import useMatchHighlightContext from "../hooks/use-match-highlight"
import { getCalculatedStyles } from "../settings"
import type { BracketSnippet, CalculatedStyles, Position } from "../types"

interface ConnectorProps {
    bracketSnippet?: BracketSnippet | null
    previousBottomMatchPosition?: Position | false | null
    previousTopMatchPosition?: Position | false | null
    currentMatchPosition: Position
    style: CalculatedStyles
}

const Connector = ({
    bracketSnippet,
    previousBottomMatchPosition = null,
    previousTopMatchPosition = null,
    currentMatchPosition,
    style
}: ConnectorProps) => {
    const {
        boxHeight,
        connectorColor,
        roundHeader,
        roundSeparatorWidth,
        lineInfo,
        horizontalOffset,
        connectorColorHighlight,
        width
    } = getCalculatedStyles(style)
    const pathInfo = (multiplier: number): string[] => {
        const middlePointOfMatchComponent = boxHeight / 2
        const previousMatch =
            multiplier > 0
                ? previousBottomMatchPosition
                : previousTopMatchPosition
        // Type guard only: pathInfo is invoked solely for sides whose
        // position was checked truthy below, so this branch is unreachable.
        if (!previousMatch) {
            return []
        }
        const startPoint = `${currentMatchPosition.x - horizontalOffset - lineInfo.separation} ${
            currentMatchPosition.y +
            lineInfo.homeVisitorSpread * multiplier +
            middlePointOfMatchComponent +
            (roundHeader.isShown
                ? roundHeader.height + roundHeader.marginBottom
                : 0)
        }`
        const horizontalWidthLeft =
            currentMatchPosition.x - roundSeparatorWidth / 2 - horizontalOffset
        const isPreviousMatchOnSameYLevel =
            Math.abs(currentMatchPosition.y - previousMatch.y) < 1
        const verticalHeight =
            previousMatch.y +
            middlePointOfMatchComponent +
            (roundHeader.isShown
                ? roundHeader.height + roundHeader.marginBottom
                : 0)
        const horizontalWidthRight = previousMatch.x + width
        if (isPreviousMatchOnSameYLevel) {
            return [`M${startPoint}`, `H${horizontalWidthRight}`]
        }
        return [
            `M${startPoint}`,
            `H${horizontalWidthLeft}`,
            `V${verticalHeight}`,
            `H${horizontalWidthRight}`
        ]
    }
    const { topHighlighted, bottomHighlighted } = useMatchHighlightContext({
        bracketSnippet
    })
    const { x, y } = currentMatchPosition
    return (
        <>
            {previousTopMatchPosition && (
                <path
                    d={pathInfo(-1).join(" ")}
                    id={`connector-${x}-${y}-${-1}`}
                    fill="transparent"
                    stroke={
                        topHighlighted
                            ? connectorColorHighlight
                            : connectorColor
                    }
                />
            )}
            {previousBottomMatchPosition && (
                <path
                    d={pathInfo(1).join(" ")}
                    id={`connector-${x}-${y}-${1}`}
                    fill="transparent"
                    stroke={
                        bottomHighlighted
                            ? connectorColorHighlight
                            : connectorColor
                    }
                />
            )}
            {topHighlighted && <use href={`connector-${x}-${y}-${-1}`} />}
            {bottomHighlighted && <use href={`connector-${x}-${y}-${1}`} />}
        </>
    )
}
export default Connector
