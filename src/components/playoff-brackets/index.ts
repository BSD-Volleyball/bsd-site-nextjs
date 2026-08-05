import DoubleEliminationBracketImpl from "./bracket-double/double-elim-bracket"
import SingleEliminationBracketImpl from "./bracket-single/single-elim-bracket"
import { MATCH_STATES } from "./core/match-states"

export type {
    BracketSnippet,
    BracketStyle,
    BracketTheme,
    CalculatedStyles,
    DoubleEliminationBracketProps,
    SingleEliminationBracketProps,
    HoveredPartyPayload,
    LineInfo,
    Match,
    MatchClickHandler,
    MatchComponentParty,
    MatchComponentProps,
    MatchContextAction,
    MatchContextValue,
    MatchHighlightState,
    MatchParticipant,
    PartyClickHandler,
    Position,
    RoundHeaderTheme,
    SvgWrapperProps
} from "./types"
export type { MatchState } from "./core/match-states"

export const DoubleEliminationBracket = DoubleEliminationBracketImpl
export const SingleEliminationBracket = SingleEliminationBracketImpl

export { MATCH_STATES }
export default DoubleEliminationBracket
