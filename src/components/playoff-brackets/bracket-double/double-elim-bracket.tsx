import { generatePreviousRound } from "../core/match-functions"
import { calculateSVGDimensions } from "../core/calculate-svg-dimensions"
import { MatchContextProvider } from "../core/match-context"
import { defaultStyle, getCalculatedStyles } from "../settings"
import type {
    BracketTheme,
    DoubleEliminationBracketProps,
    Match,
    SvgWrapperProps
} from "../types"
import UpperBracket from "./upper-bracket"
import LowerBracket from "./lower-bracket"
import RoundHeaders from "./round-headers"
import FinalGame from "./final-game"
import ExtraFinal from "./extra-final"

function findTheFinals<M extends Match>(matches: {
    upper: M[]
    lower: M[]
}): { convergingMatch: M | undefined; finalsArray: M[] | undefined } {
    const isFinalInUpper = matches.upper.some((match) => !match.nextMatchId)
    const isFinalInLower = matches.lower.some((match) => !match.nextMatchId)

    let convergingMatch: M | undefined
    let finalsArray: M[] | undefined

    if (isFinalInLower) {
        const lastUpper = matches.upper.find((match) => {
            const hasNextMatchInUpper = matches.upper.some(
                (m) => m.id === match.nextMatchId
            )
            return !hasNextMatchInUpper
        })

        convergingMatch = matches.lower.find(
            (match) => match.id === lastUpper!.nextMatchId
        )
        finalsArray = [
            convergingMatch,
            matches.lower.find((m) => m.id === convergingMatch!.nextMatchId)
        ].filter((m): m is M => Boolean(m?.id))
    }

    if (isFinalInUpper) {
        const lastLower = matches.lower.find((match) => {
            const hasNextMatchInLower = matches.lower.some(
                (m) => m.id === match.nextMatchId
            )
            return !hasNextMatchInLower
        })

        convergingMatch = matches.upper.find(
            (match) => match.id === lastLower!.nextMatchId
        )
        finalsArray = [
            convergingMatch,
            matches.upper.find((m) => m.id === convergingMatch!.nextMatchId)
        ].filter((m): m is M => Boolean(m?.id))
    }

    return { convergingMatch, finalsArray }
}

const defaultSvgWrapper = ({ children }: SvgWrapperProps) => (
    <div>{children}</div>
)

const DoubleEliminationBracket = <M extends Match>({
    matches,
    matchComponent,
    currentRound,
    onMatchClick,
    onPartyClick,
    svgWrapper: SvgWrapper = defaultSvgWrapper,
    options
}: DoubleEliminationBracketProps<M>) => {
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

    const { convergingMatch, finalsArray } = findTheFinals(matches)
    const hasMultipleFinals = (finalsArray?.length ?? 0) > 1

    const generateColumn = (matchesColumn: M[], listOfMatches: M[]): M[][] => {
        const previousMatchesColumn = generatePreviousRound(
            matchesColumn,
            listOfMatches
        )
        if (previousMatchesColumn.length > 0) {
            return [
                ...generateColumn(previousMatchesColumn, listOfMatches),
                previousMatchesColumn
            ]
        }
        return [previousMatchesColumn]
    }

    const generate2DBracketArray = (
        final: M | undefined,
        listOfMatches: M[]
    ): M[][] =>
        final
            ? [...generateColumn([final], listOfMatches), []].filter(
                  (arr) => arr.length > 0
              )
            : []

    const upperColumns = generate2DBracketArray(convergingMatch, matches.upper)
    const lowerColumns = generate2DBracketArray(convergingMatch, matches.lower)

    const totalNumOfRounds =
        lowerColumns.length +
        1 +
        (hasMultipleFinals ? finalsArray!.length - 1 : 0)

    const upperBracketDimensions = calculateSVGDimensions(
        upperColumns[0].length,
        upperColumns.length,
        rowHeight,
        columnWidth,
        canvasPadding,
        roundHeader,
        currentRound
    )

    const lowerBracketDimensions = calculateSVGDimensions(
        lowerColumns[0].length,
        lowerColumns.length,
        rowHeight,
        columnWidth,
        canvasPadding,
        roundHeader,
        currentRound
    )

    const fullBracketDimensions = calculateSVGDimensions(
        lowerColumns[0].length,
        totalNumOfRounds,
        rowHeight,
        columnWidth,
        canvasPadding,
        roundHeader,
        currentRound
    )

    const { gameWidth } = fullBracketDimensions
    const gameHeight =
        upperBracketDimensions.gameHeight + lowerBracketDimensions.gameHeight
    const { startPosition } = upperBracketDimensions

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
                            numOfRounds={totalNumOfRounds}
                            calculatedStyles={calculatedStyles}
                        />
                        <UpperBracket
                            columns={upperColumns}
                            calculatedStyles={calculatedStyles}
                            gameHeight={gameHeight}
                            gameWidth={gameWidth}
                            onMatchClick={onMatchClick}
                            onPartyClick={onPartyClick}
                            matchComponent={matchComponent}
                        />
                        <LowerBracket
                            columns={lowerColumns}
                            calculatedStyles={calculatedStyles}
                            gameHeight={gameHeight}
                            gameWidth={gameWidth}
                            onMatchClick={onMatchClick}
                            onPartyClick={onPartyClick}
                            matchComponent={matchComponent}
                            upperBracketHeight={
                                upperBracketDimensions.gameHeight
                            }
                        />
                        <FinalGame
                            match={convergingMatch!}
                            numOfUpperRounds={upperColumns.length}
                            numOfLowerRounds={lowerColumns.length}
                            bracketSnippet={{
                                previousTopMatch:
                                    upperColumns[upperColumns.length - 1][0],
                                previousBottomMatch:
                                    lowerColumns[lowerColumns.length - 1][0],
                                currentMatch: convergingMatch
                            }}
                            upperBracketHeight={
                                upperBracketDimensions.gameHeight
                            }
                            lowerBracketHeight={
                                lowerBracketDimensions.gameHeight
                            }
                            calculatedStyles={calculatedStyles}
                            columnIndex={lowerColumns.length}
                            rowIndex={0}
                            gameHeight={gameHeight}
                            gameWidth={gameWidth}
                            matchComponent={matchComponent}
                            onMatchClick={onMatchClick}
                            onPartyClick={onPartyClick}
                            firstRoundLowerMatchCount={
                                lowerColumns[0]?.length || 0
                            }
                        />
                        {hasMultipleFinals && (
                            <ExtraFinal
                                match={finalsArray![1]}
                                numOfUpperRounds={upperColumns.length}
                                numOfLowerRounds={lowerColumns.length}
                                bracketSnippet={{
                                    previousBottomMatch: finalsArray![0],
                                    currentMatch: finalsArray![1]
                                }}
                                upperBracketHeight={
                                    upperBracketDimensions.gameHeight
                                }
                                lowerBracketHeight={
                                    lowerBracketDimensions.gameHeight
                                }
                                calculatedStyles={calculatedStyles}
                                columnIndex={lowerColumns.length + 1}
                                rowIndex={0}
                                gameHeight={gameHeight}
                                gameWidth={gameWidth}
                                matchComponent={matchComponent}
                                onMatchClick={onMatchClick}
                                onPartyClick={onPartyClick}
                            />
                        )}
                    </g>
                </MatchContextProvider>
            </svg>
        </SvgWrapper>
    )
}

export default DoubleEliminationBracket
