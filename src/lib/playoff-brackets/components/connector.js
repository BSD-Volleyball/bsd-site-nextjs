import {
    jsx as _jsx,
    Fragment as _Fragment,
    jsxs as _jsxs
} from "react/jsx-runtime"
import useMatchHighlightContext from "../hooks/use-match-highlight"
import { getCalculatedStyles } from "../settings"
const Connector = ({
    bracketSnippet,
    previousBottomMatchPosition = null,
    previousTopMatchPosition = null,
    currentMatchPosition,
    style
}) => {
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
    const pathInfo = (multiplier) => {
        const middlePointOfMatchComponent = boxHeight / 2
        const previousMatch =
            multiplier > 0
                ? previousBottomMatchPosition
                : previousTopMatchPosition
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
    return _jsxs(_Fragment, {
        children: [
            previousTopMatchPosition &&
                _jsx("path", {
                    d: pathInfo(-1).join(" "),
                    id: `connector-${x}-${y}-${-1}`,
                    fill: "transparent",
                    stroke: topHighlighted
                        ? connectorColorHighlight
                        : connectorColor
                }),
            previousBottomMatchPosition &&
                _jsx("path", {
                    d: pathInfo(1).join(" "),
                    id: `connector-${x}-${y}-${1}`,
                    fill: "transparent",
                    stroke: bottomHighlighted
                        ? connectorColorHighlight
                        : connectorColor
                }),
            topHighlighted &&
                _jsx("use", { href: `connector-${x}-${y}-${-1}` }),
            bottomHighlighted &&
                _jsx("use", { href: `connector-${x}-${y}-${1}` })
        ]
    })
}
export default Connector
//# sourceMappingURL=connector.js.map
