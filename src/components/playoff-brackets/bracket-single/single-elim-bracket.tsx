import { generatePreviousRound } from "../core/match-functions"
import { calculateSVGDimensions } from "../core/calculate-svg-dimensions"
import { MatchContextProvider } from "../core/match-context"
import { defaultStyle, getCalculatedStyles } from "../settings"
import type {
    BracketTheme,
    Match,
    SingleEliminationBracketProps,
    SvgWrapperProps
} from "../types"
import UpperBracket from "../bracket-double/upper-bracket"
import RoundHeaders from "../bracket-double/round-headers"

const defaultSvgWrapper = ({ children }: SvgWrapperProps) => (
    <div>{children}</div>
)

/**
 * Single-elimination companion to DoubleEliminationBracket, assembled from
 * the same internals: one balanced tree rendered by UpperBracket, with the
 * final as the last column (no losers bracket, no separate final game).
 */
const SingleEliminationBracket = <M extends Match>({
    matches,
    matchComponent,
    currentRound,
    onMatchClick,
    onPartyClick,
    svgWrapper: SvgWrapper = defaultSvgWrapper,
    options
}: SingleEliminationBracketProps<M>) => {
    const inputStyle = options?.style || defaultStyle

    const style: BracketTheme = {
        ...defaultStyle,
        ...inputStyle,
        roundHeader: {
            ...defaultStyle.roundHeader,
            ...inputStyle.roundHeader
        },
        lineInfo: {
            ...defaultStyle.lineInfo,
            ...inputStyle.lineInfo
        }
    }

    const calculatedStyles = getCalculatedStyles(style)
    const { roundHeader, columnWidth, canvasPadding, rowHeight } =
        calculatedStyles

    // The final is the match nothing advances into; fall back to the last
    // match so malformed data still renders instead of crashing.
    const final =
        matches.find((match) => !match.nextMatchId) ??
        matches[matches.length - 1]
    if (!final) return null

    const generateColumn = (matchesColumn: M[]): M[][] => {
        const previousMatchesColumn = generatePreviousRound(
            matchesColumn,
            matches
        )
        if (previousMatchesColumn.length > 0) {
            return [
                ...generateColumn(previousMatchesColumn),
                previousMatchesColumn
            ]
        }
        return []
    }
    const columns = [...generateColumn([final]), [final]]

    const { gameWidth, gameHeight, startPosition } = calculateSVGDimensions(
        columns[0].length,
        columns.length,
        rowHeight,
        columnWidth,
        canvasPadding,
        roundHeader,
        currentRound ?? ""
    )

    return (
        <SvgWrapper
            bracketWidth={gameWidth}
            bracketHeight={gameHeight}
            startAt={startPosition}
        >
            <svg
                height={gameHeight}
                width={gameWidth}
                viewBox={`0 0 ${gameWidth} ${gameHeight}`}
            >
                <MatchContextProvider>
                    <g>
                        <RoundHeaders
                            numOfRounds={columns.length}
                            calculatedStyles={calculatedStyles}
                        />
                        <UpperBracket
                            columns={columns}
                            calculatedStyles={calculatedStyles}
                            gameHeight={gameHeight}
                            gameWidth={gameWidth}
                            onMatchClick={onMatchClick}
                            onPartyClick={onPartyClick}
                            matchComponent={matchComponent}
                        />
                    </g>
                </MatchContextProvider>
            </svg>
        </SvgWrapper>
    )
}

export default SingleEliminationBracket
