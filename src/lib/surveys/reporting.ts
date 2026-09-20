/**
 * reporting.ts — aggregation, trend and CSV-export math for survey results.
 *
 * Pure, framework-free: no db, no server-only, no Next imports. Both server
 * actions and client report/CSV-building components import from here.
 *
 * CSV consumers must serialize each cell through `serializeCsvField` from
 * `src/lib/utils.ts` before writing it to a file — the rows returned here are
 * raw values (numbers, strings, null), not escaped CSV text.
 */

import { isEmptyAnswer, optionsOf, QUESTION_TYPE_DEFS } from "./question-types"
import type {
    AnswerMap,
    AnswerValue,
    RespondentSegments,
    SurveyGender,
    SurveyQuestionConfig,
    SurveyQuestionDef,
    SurveyRoleTag
} from "./types"

// ---------------------------------------------------------------------------
// Rounding helpers
// ---------------------------------------------------------------------------

function roundTo(value: number, decimals: number): number {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
}

/** Percentages: 0-100 rounded to one decimal. */
function roundPct(value: number): number {
    return roundTo(value, 1)
}

/** Means/medians/average positions: rounded to two decimals. */
function roundMean(value: number): number {
    return roundTo(value, 2)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportResponse extends RespondentSegments {
    responseId: number
    submittedOn: string | null
    answers: AnswerMap
}

export interface SegmentFilter {
    roleTag?: SurveyRoleTag
    divisionId?: number
    gender?: SurveyGender
}

export type QuestionAggregate =
    | { type: "section"; answered: 0 }
    | {
          type: "yes_no"
          answered: number
          yes: number
          no: number
          yesPct: number | null
      }
    | {
          type: "rating"
          answered: number
          mean: number | null
          median: number | null
          distribution: { value: number; count: number }[]
          nps: {
              promoters: number
              passives: number
              detractors: number
              score: number
          } | null
      }
    | {
          type: "likert"
          answered: number
          options: { key: string; label: string; count: number; pct: number }[]
          mean: number | null
          topBoxPct: number | null
      }
    | {
          type: "single_choice" | "multi_choice"
          answered: number
          options: { key: string; label: string; count: number; pct: number }[]
      }
    | {
          type: "ranking"
          answered: number
          options: {
              key: string
              label: string
              averagePosition: number | null
              firstPlace: number
          }[]
      }
    | { type: "text"; answered: number; answers: string[] }

export interface SurveyReport {
    invited: number
    submitted: number
    responseRate: number | null
    filteredCount: number
    suppressed: boolean
    byQuestion: { question: SurveyQuestionDef; aggregate: QuestionAggregate }[]
}

export interface TrendInstance {
    surveyId: number
    label: string
    orderKey: number
    submitted: number
    aggregates: Record<number, QuestionAggregate>
}

export interface TrendSeries {
    key: string
    label: string
    points: {
        surveyId: number
        label: string
        value: number | null
        n: number
    }[]
}

export interface QuestionTrend {
    question: SurveyQuestionDef
    series: TrendSeries[]
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export function matchesFilter(
    r: RespondentSegments,
    f: SegmentFilter
): boolean {
    if (f.roleTag !== undefined && !r.roleTags.includes(f.roleTag)) {
        return false
    }
    if (f.divisionId !== undefined && r.divisionId !== f.divisionId) {
        return false
    }
    if (f.gender !== undefined && r.gender !== f.gender) {
        return false
    }
    return true
}

// ---------------------------------------------------------------------------
// Question aggregation
// ---------------------------------------------------------------------------

const LIKERT_WEIGHT: Record<string, number> = {
    strongly_disagree: 1,
    disagree: 2,
    neutral: 3,
    agree: 4,
    strongly_agree: 5
}

export function aggregateQuestion(
    question: SurveyQuestionDef,
    values: AnswerValue[]
): QuestionAggregate {
    if (!QUESTION_TYPE_DEFS[question.type].hasAnswer) {
        return { type: "section", answered: 0 }
    }

    const answered = values.filter((v) => !isEmptyAnswer(v))

    switch (question.type) {
        case "section":
            // Unreachable: the hasAnswer check above already returned for
            // section questions. Kept so this switch stays exhaustive.
            return { type: "section", answered: 0 }
        case "yes_no": {
            const bools = answered as boolean[]
            const yes = bools.filter(Boolean).length
            const n = bools.length
            return {
                type: "yes_no",
                answered: n,
                yes,
                no: n - yes,
                yesPct: n > 0 ? roundPct((yes / n) * 100) : null
            }
        }

        case "rating": {
            const config = question.config as Extract<
                SurveyQuestionConfig,
                { type: "rating" }
            >
            const nums = (answered as number[]).slice().sort((a, b) => a - b)
            const n = nums.length
            const mean = n > 0 ? roundMean(sum(nums) / n) : null
            let median: number | null = null
            if (n > 0) {
                const mid = Math.floor(n / 2)
                median =
                    n % 2 === 0
                        ? roundMean((nums[mid - 1] + nums[mid]) / 2)
                        : roundMean(nums[mid])
            }
            const counts = new Map<number, number>()
            for (const v of nums) counts.set(v, (counts.get(v) ?? 0) + 1)
            const distribution = [...counts.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([value, count]) => ({ value, count }))

            const npsEligible =
                config.preset === "nps" ||
                (config.min === 0 && config.max === 10)
            let nps: Extract<QuestionAggregate, { type: "rating" }>["nps"] =
                null
            if (npsEligible && n > 0) {
                const promoters = nums.filter((v) => v >= 9).length
                const passives = nums.filter((v) => v >= 7 && v <= 8).length
                const detractors = nums.filter((v) => v <= 6).length
                const score = Math.round(
                    (promoters / n) * 100 - (detractors / n) * 100
                )
                nps = { promoters, passives, detractors, score }
            }

            return {
                type: "rating",
                answered: n,
                mean,
                median,
                distribution,
                nps
            }
        }

        case "likert": {
            const config = question.config as Extract<
                SurveyQuestionConfig,
                { type: "likert" }
            >
            // Option keys can never be removed or re-keyed once a question has
            // answers (see the lock rule in template-rules.ts), so an unknown
            // key should be unreachable in practice. Defend anyway: an answer
            // whose key matches no current option does not count as answered,
            // so it cannot dilute the percentages below.
            const knownKeys = new Set(config.options.map((opt) => opt.key))
            const strs = (answered as string[]).filter((v) => knownKeys.has(v))
            const n = strs.length
            const options = config.options.map((opt) => {
                const count = strs.filter((v) => v === opt.key).length
                return {
                    key: opt.key,
                    label: opt.label,
                    count,
                    pct: n > 0 ? roundPct((count / n) * 100) : 0
                }
            })
            const mean =
                n > 0
                    ? roundMean(sum(strs.map((v) => LIKERT_WEIGHT[v] ?? 0)) / n)
                    : null
            const topBoxCount = strs.filter(
                (v) => v === "agree" || v === "strongly_agree"
            ).length
            const topBoxPct = n > 0 ? roundPct((topBoxCount / n) * 100) : null
            return { type: "likert", answered: n, options, mean, topBoxPct }
        }

        case "single_choice":
        case "multi_choice": {
            const config = question.config as Extract<
                SurveyQuestionConfig,
                { type: "single_choice" } | { type: "multi_choice" }
            >
            const isMulti = question.type === "multi_choice"
            const knownKeys = new Set(config.options.map((opt) => opt.key))
            // See the likert case above: option keys are locked once a
            // question has answers, so an unknown key should be unreachable.
            // Defend anyway — an answer with no recognized key does not count
            // as answered, so it cannot dilute the percentages below.
            const known = isMulti
                ? (answered as string[][]).filter((v) =>
                      v.some((key) => knownKeys.has(key))
                  )
                : (answered as string[]).filter((v) => knownKeys.has(v))
            const n = known.length
            const options = config.options.map((opt) => {
                const count = isMulti
                    ? (known as string[][]).filter((v) => v.includes(opt.key))
                          .length
                    : (known as string[]).filter((v) => v === opt.key).length
                return {
                    key: opt.key,
                    label: opt.label,
                    count,
                    pct: n > 0 ? roundPct((count / n) * 100) : 0
                }
            })
            return {
                type: question.type as "single_choice" | "multi_choice",
                answered: n,
                options
            }
        }

        case "ranking": {
            const config = question.config as Extract<
                SurveyQuestionConfig,
                { type: "ranking" }
            >
            // See the likert case above: option keys are locked once a
            // question has answers, so an unknown key should be unreachable.
            // Defend anyway — a ranking with no recognized key does not count
            // as answered, so it cannot dilute the average positions below.
            const knownKeys = new Set(config.options.map((opt) => opt.key))
            const rankings = (answered as string[][]).filter((ranking) =>
                ranking.some((key) => knownKeys.has(key))
            )
            const n = rankings.length
            const options = config.options.map((opt) => {
                const positions: number[] = []
                let firstPlace = 0
                for (const ranking of rankings) {
                    const idx = ranking.indexOf(opt.key)
                    if (idx >= 0) {
                        positions.push(idx + 1)
                        if (idx === 0) firstPlace++
                    }
                }
                const averagePosition =
                    positions.length > 0
                        ? roundMean(sum(positions) / positions.length)
                        : null
                return {
                    key: opt.key,
                    label: opt.label,
                    averagePosition,
                    firstPlace
                }
            })
            return { type: "ranking", answered: n, options }
        }

        case "text": {
            const strs = (answered as string[])
                .map((v) => v.trim())
                .filter((v) => v.length > 0)
            return { type: "text", answered: strs.length, answers: strs }
        }
    }
}

function sum(values: number[]): number {
    return values.reduce((a, b) => a + b, 0)
}

// ---------------------------------------------------------------------------
// Survey aggregation
// ---------------------------------------------------------------------------

function hasAnyFilterField(f: SegmentFilter): boolean {
    return (
        f.roleTag !== undefined ||
        f.divisionId !== undefined ||
        f.gender !== undefined
    )
}

export function aggregateSurvey(input: {
    questions: SurveyQuestionDef[]
    responses: ReportResponse[]
    invited: number
    filter: SegmentFilter
    anonymous: boolean
    minCell?: number
}): SurveyReport {
    const { questions, responses, invited, filter, anonymous } = input
    const minCell = input.minCell ?? 5

    const submitted = responses.length
    const filtered = responses.filter((r) => matchesFilter(r, filter))
    const filteredCount = filtered.length
    const responseRate =
        invited > 0 ? roundPct((submitted / invited) * 100) : null
    const suppressed =
        anonymous && hasAnyFilterField(filter) && filteredCount < minCell

    const byQuestion = questions.map((question) => {
        const values: AnswerValue[] = suppressed
            ? []
            : filtered
                  .map((r) => r.answers[question.id])
                  .filter((v): v is AnswerValue => v !== undefined)
        return { question, aggregate: aggregateQuestion(question, values) }
    })

    return {
        invited,
        submitted,
        responseRate,
        filteredCount,
        suppressed,
        byQuestion
    }
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

/**
 * The trend/report series a question exposes, derived from its config alone
 * (not from any particular aggregate). This is what makes a NPS-preset rating
 * question always offer both a "mean" and a "nps" series, even for an
 * instance whose aggregate happens to have zero answers.
 */
export function seriesDefsFor(
    question: SurveyQuestionDef
): { key: string; label: string }[] {
    switch (question.type) {
        case "section":
            return []
        case "yes_no":
            return [{ key: "yes", label: "Yes %" }]
        case "rating": {
            const config = question.config as Extract<
                SurveyQuestionConfig,
                { type: "rating" }
            >
            const defs = [{ key: "mean", label: "Average" }]
            const npsEligible =
                config.preset === "nps" ||
                (config.min === 0 && config.max === 10)
            if (npsEligible) {
                defs.push({ key: "nps", label: "NPS" })
            }
            return defs
        }
        case "likert":
            return [
                { key: "mean", label: "Average (1-5)" },
                { key: "topbox", label: "Agree %" }
            ]
        case "single_choice":
        case "multi_choice": {
            const config = question.config as Extract<
                SurveyQuestionConfig,
                { type: "single_choice" } | { type: "multi_choice" }
            >
            return config.options.map((opt) => ({
                key: `opt:${opt.key}`,
                label: `${opt.label} %`
            }))
        }
        case "ranking": {
            const config = question.config as Extract<
                SurveyQuestionConfig,
                { type: "ranking" }
            >
            return config.options.map((opt) => ({
                key: `rank:${opt.key}`,
                label: `${opt.label} avg position`
            }))
        }
        case "text":
            return [{ key: "count", label: "Responses" }]
    }
}

/** The value a given series key takes from one aggregate, or null when that
 * aggregate has nothing for it (wrong shape, or an option/series absent from
 * this particular aggregate). */
function valueForSeries(
    aggregate: QuestionAggregate,
    key: string
): number | null {
    switch (aggregate.type) {
        case "section":
            return null
        case "yes_no":
            return key === "yes" ? aggregate.yesPct : null
        case "rating":
            if (key === "mean") return aggregate.mean
            if (key === "nps") return aggregate.nps ? aggregate.nps.score : null
            return null
        case "likert":
            if (key === "mean") return aggregate.mean
            if (key === "topbox") return aggregate.topBoxPct
            return null
        case "single_choice":
        case "multi_choice": {
            if (!key.startsWith("opt:")) return null
            const opt = aggregate.options.find((o) => `opt:${o.key}` === key)
            return opt ? opt.pct : null
        }
        case "ranking": {
            if (!key.startsWith("rank:")) return null
            const opt = aggregate.options.find((o) => `rank:${o.key}` === key)
            return opt ? opt.averagePosition : null
        }
        case "text":
            return key === "count" ? aggregate.answered : null
    }
}

export function trendValues(
    question: SurveyQuestionDef,
    aggregate: QuestionAggregate
): { key: string; label: string; value: number | null }[] {
    return seriesDefsFor(question).map((def) => ({
        ...def,
        value: valueForSeries(aggregate, def.key)
    }))
}

export function buildTrend(
    questions: SurveyQuestionDef[],
    instances: TrendInstance[]
): QuestionTrend[] {
    const sorted = [...instances].sort((a, b) => a.orderKey - b.orderKey)

    return questions.map((question) => {
        const seriesDefs = seriesDefsFor(question)

        const series: TrendSeries[] = seriesDefs.map((def) => ({
            key: def.key,
            label: def.label,
            points: sorted.map((instance) => {
                const aggregate = instance.aggregates[question.id]
                if (!aggregate) {
                    return {
                        surveyId: instance.surveyId,
                        label: instance.label,
                        value: null,
                        n: 0
                    }
                }
                return {
                    surveyId: instance.surveyId,
                    label: instance.label,
                    value: valueForSeries(aggregate, def.key),
                    n: aggregate.answered
                }
            })
        }))

        return { question, series }
    })
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvValueFor(
    question: SurveyQuestionDef,
    value: AnswerValue | undefined
): unknown {
    if (isEmptyAnswer(value)) return ""

    switch (question.type) {
        case "yes_no":
            return value ? "Yes" : "No"
        case "rating":
            return value as number
        case "single_choice":
        case "likert": {
            const opts = optionsOf(question.config)
            const found = opts.find((o) => o.key === value)
            return found ? found.label : String(value)
        }
        case "multi_choice": {
            const opts = optionsOf(question.config)
            return (value as string[])
                .map((key) => opts.find((o) => o.key === key)?.label ?? key)
                .join("; ")
        }
        case "ranking": {
            const opts = optionsOf(question.config)
            return (value as string[])
                .map((key) => opts.find((o) => o.key === key)?.label ?? key)
                .join(" > ")
        }
        case "text":
            return value as string
        default:
            return ""
    }
}

/**
 * Below this many responses, an anonymous export drops its segment columns
 * too. Role tags + division + gender is close to a fingerprint on a small
 * list, and a spreadsheet is the one place the aggregate report's small-cell
 * suppression cannot follow the data.
 */
const CSV_SEGMENT_MIN = 10

export function buildResponsesCsv(
    questions: SurveyQuestionDef[],
    responses: (ReportResponse & { name?: string; email?: string })[],
    opts: { anonymous: boolean }
): { headers: string[]; rows: unknown[][] } {
    const answerableQuestions = questions.filter(
        (q) => QUESTION_TYPE_DEFS[q.type].hasAnswer
    )

    // An anonymous survey stores the submit date at league-day midnight, but
    // the export is still a list: a date column sorts it into submission
    // order, which lines up with the invite list's "Submitted" badges. Drop
    // it entirely rather than hope nobody cross-references.
    const includeSubmittedOn = !opts.anonymous
    const includeSegments =
        !opts.anonymous || responses.length >= CSV_SEGMENT_MIN

    const headers = [
        "Response ID",
        ...(includeSubmittedOn ? ["Submitted on"] : []),
        ...(includeSegments ? ["Role tags", "Division ID", "Gender"] : []),
        ...(opts.anonymous ? [] : ["Name", "Email"]),
        ...answerableQuestions.map((q) => q.prompt)
    ]

    const rows = responses.map((r) => {
        const base: unknown[] = [
            r.responseId,
            ...(includeSubmittedOn ? [r.submittedOn] : []),
            ...(includeSegments
                ? [r.roleTags.join("; "), r.divisionId, r.gender]
                : []),
            ...(opts.anonymous ? [] : [r.name ?? "", r.email ?? ""])
        ]
        const answerCells = answerableQuestions.map((q) =>
            csvValueFor(q, r.answers[q.id])
        )
        return [...base, ...answerCells]
    })

    return { headers, rows }
}
