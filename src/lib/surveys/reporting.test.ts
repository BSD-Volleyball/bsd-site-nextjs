import { describe, expect, it } from "vitest"
import {
    aggregateQuestion,
    aggregateSurvey,
    buildResponsesCsv,
    buildTrend,
    matchesFilter,
    type ReportResponse,
    type TrendInstance,
    trendValues
} from "./reporting"
import {
    LIKERT_OPTIONS,
    type RespondentSegments,
    type SurveyOption,
    type SurveyQuestionConfig,
    type SurveyQuestionDef,
    type SurveyQuestionType
} from "./types"

const CHOICES: SurveyOption[] = [
    { key: "opt_a", label: "Alpha" },
    { key: "opt_b", label: "Bravo" },
    { key: "opt_c", label: "Charlie" }
]

function q(
    id: number,
    type: SurveyQuestionType,
    config: SurveyQuestionConfig,
    extras?: Partial<SurveyQuestionDef>
): SurveyQuestionDef {
    return {
        id,
        sortOrder: id,
        type,
        prompt: `Question ${id}`,
        helpText: null,
        required: false,
        config,
        visibility: { conditions: [], roleTags: [] },
        archivedAt: null,
        ...extras
    }
}

// ---------------------------------------------------------------------------
// matchesFilter
// ---------------------------------------------------------------------------

describe("matchesFilter", () => {
    const r: RespondentSegments = {
        roleTags: ["captain", "rostered"],
        divisionId: 10,
        gender: "male"
    }

    it("matches an empty filter", () => {
        expect(matchesFilter(r, {})).toBe(true)
    })

    it("requires every set field to match", () => {
        expect(matchesFilter(r, { roleTag: "captain" })).toBe(true)
        expect(matchesFilter(r, { roleTag: "coach" })).toBe(false)
        expect(matchesFilter(r, { divisionId: 10 })).toBe(true)
        expect(matchesFilter(r, { divisionId: 20 })).toBe(false)
        expect(matchesFilter(r, { gender: "male" })).toBe(true)
        expect(matchesFilter(r, { gender: "non_male" })).toBe(false)
        expect(
            matchesFilter(r, {
                roleTag: "captain",
                divisionId: 10,
                gender: "male"
            })
        ).toBe(true)
        expect(
            matchesFilter(r, {
                roleTag: "captain",
                divisionId: 99,
                gender: "male"
            })
        ).toBe(false)
    })

    it("checks divisionId and gender against null respondent fields", () => {
        const anon: RespondentSegments = {
            roleTags: [],
            divisionId: null,
            gender: null
        }
        expect(matchesFilter(anon, {})).toBe(true)
        expect(matchesFilter(anon, { divisionId: 10 })).toBe(false)
        expect(matchesFilter(anon, { gender: "male" })).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// aggregateQuestion
// ---------------------------------------------------------------------------

describe("aggregateQuestion", () => {
    it("returns the empty section shape regardless of values", () => {
        const section = q(1, "section", { type: "section" })
        expect(aggregateQuestion(section, [])).toEqual({
            type: "section",
            answered: 0
        })
        expect(aggregateQuestion(section, ["anything" as never])).toEqual({
            type: "section",
            answered: 0
        })
    })

    it("aggregates yes_no answers", () => {
        const yesNo = q(1, "yes_no", { type: "yes_no" })
        expect(aggregateQuestion(yesNo, [true, true, false])).toEqual({
            type: "yes_no",
            answered: 3,
            yes: 2,
            no: 1,
            yesPct: 66.7
        })
    })

    it("returns the empty shape for yes_no with no answers", () => {
        const yesNo = q(1, "yes_no", { type: "yes_no" })
        expect(aggregateQuestion(yesNo, [])).toEqual({
            type: "yes_no",
            answered: 0,
            yes: 0,
            no: 0,
            yesPct: null
        })
    })

    it("aggregates a 1-5 rating question without NPS", () => {
        const rating = q(1, "rating", {
            type: "rating",
            min: 1,
            max: 5,
            preset: "1-5"
        })
        const result = aggregateQuestion(rating, [3, 4, 4, 5, 2])
        expect(result).toEqual({
            type: "rating",
            answered: 5,
            mean: 3.6,
            median: 4,
            distribution: [
                { value: 2, count: 1 },
                { value: 3, count: 1 },
                { value: 4, count: 2 },
                { value: 5, count: 1 }
            ],
            nps: null
        })
    })

    it("computes NPS for a nps-preset rating question", () => {
        const nps = q(1, "rating", {
            type: "rating",
            min: 0,
            max: 10,
            preset: "nps"
        })
        const result = aggregateQuestion(nps, [9, 10, 8, 3, 7, 6, 10])
        expect(result).toEqual({
            type: "rating",
            answered: 7,
            mean: 7.57,
            median: 8,
            distribution: [
                { value: 3, count: 1 },
                { value: 6, count: 1 },
                { value: 7, count: 1 },
                { value: 8, count: 1 },
                { value: 9, count: 1 },
                { value: 10, count: 2 }
            ],
            nps: { promoters: 3, passives: 2, detractors: 2, score: 14 }
        })
    })

    it("computes NPS for a min-0-max-10 rating question without an explicit preset", () => {
        const rating = q(1, "rating", { type: "rating", min: 0, max: 10 })
        const result = aggregateQuestion(rating, [9, 10, 8, 3, 7, 6, 10])
        expect(result.type).toBe("rating")
        expect(result.type === "rating" ? result.nps : null).toEqual({
            promoters: 3,
            passives: 2,
            detractors: 2,
            score: 14
        })
    })

    it("returns the empty shape for rating with no answers", () => {
        const rating = q(1, "rating", { type: "rating", min: 1, max: 5 })
        expect(aggregateQuestion(rating, [])).toEqual({
            type: "rating",
            answered: 0,
            mean: null,
            median: null,
            distribution: [],
            nps: null
        })
    })

    it("aggregates a likert question", () => {
        const likert = q(1, "likert", {
            type: "likert",
            options: LIKERT_OPTIONS
        })
        const result = aggregateQuestion(likert, [
            "agree",
            "strongly_agree",
            "neutral",
            "agree",
            "disagree"
        ])
        expect(result).toEqual({
            type: "likert",
            answered: 5,
            options: [
                {
                    key: "strongly_disagree",
                    label: "Strongly disagree",
                    count: 0,
                    pct: 0
                },
                { key: "disagree", label: "Disagree", count: 1, pct: 20 },
                { key: "neutral", label: "Neutral", count: 1, pct: 20 },
                { key: "agree", label: "Agree", count: 2, pct: 40 },
                {
                    key: "strongly_agree",
                    label: "Strongly agree",
                    count: 1,
                    pct: 20
                }
            ],
            mean: 3.6,
            topBoxPct: 60
        })
    })

    it("aggregates a single_choice question", () => {
        const single = q(1, "single_choice", {
            type: "single_choice",
            options: CHOICES
        })
        const result = aggregateQuestion(single, [
            "opt_a",
            "opt_b",
            "opt_a",
            "opt_c"
        ])
        expect(result).toEqual({
            type: "single_choice",
            answered: 4,
            options: [
                { key: "opt_a", label: "Alpha", count: 2, pct: 50 },
                { key: "opt_b", label: "Bravo", count: 1, pct: 25 },
                { key: "opt_c", label: "Charlie", count: 1, pct: 25 }
            ]
        })
    })

    it("aggregates a multi_choice question with percentages that can exceed 100", () => {
        const multi = q(1, "multi_choice", {
            type: "multi_choice",
            options: CHOICES
        })
        const result = aggregateQuestion(multi, [
            ["opt_a", "opt_b"],
            ["opt_a"],
            ["opt_c"]
        ])
        expect(result).toEqual({
            type: "multi_choice",
            answered: 3,
            options: [
                { key: "opt_a", label: "Alpha", count: 2, pct: 66.7 },
                { key: "opt_b", label: "Bravo", count: 1, pct: 33.3 },
                { key: "opt_c", label: "Charlie", count: 1, pct: 33.3 }
            ]
        })
    })

    it("aggregates a ranking question with 1-based average positions", () => {
        const ranking = q(1, "ranking", {
            type: "ranking",
            options: CHOICES
        })
        const result = aggregateQuestion(ranking, [
            ["opt_a", "opt_b", "opt_c"],
            ["opt_b", "opt_a", "opt_c"]
        ])
        expect(result).toEqual({
            type: "ranking",
            answered: 2,
            options: [
                {
                    key: "opt_a",
                    label: "Alpha",
                    averagePosition: 1.5,
                    firstPlace: 1
                },
                {
                    key: "opt_b",
                    label: "Bravo",
                    averagePosition: 1.5,
                    firstPlace: 1
                },
                {
                    key: "opt_c",
                    label: "Charlie",
                    averagePosition: 3,
                    firstPlace: 0
                }
            ]
        })
    })

    it("returns the empty shape for ranking with no answers", () => {
        const ranking = q(1, "ranking", { type: "ranking", options: CHOICES })
        expect(aggregateQuestion(ranking, [])).toEqual({
            type: "ranking",
            answered: 0,
            options: [
                {
                    key: "opt_a",
                    label: "Alpha",
                    averagePosition: null,
                    firstPlace: 0
                },
                {
                    key: "opt_b",
                    label: "Bravo",
                    averagePosition: null,
                    firstPlace: 0
                },
                {
                    key: "opt_c",
                    label: "Charlie",
                    averagePosition: null,
                    firstPlace: 0
                }
            ]
        })
    })

    it("trims text answers and drops blanks", () => {
        const text = q(1, "text", { type: "text", variant: "long" })
        const result = aggregateQuestion(text, [
            "  Great job  ",
            "",
            "   ",
            "Thanks!"
        ])
        expect(result).toEqual({
            type: "text",
            answered: 2,
            answers: ["Great job", "Thanks!"]
        })
    })
})

// ---------------------------------------------------------------------------
// aggregateSurvey
// ---------------------------------------------------------------------------

function response(overrides: Partial<ReportResponse>): ReportResponse {
    return {
        responseId: 1,
        submittedOn: "2026-01-01",
        roleTags: [],
        divisionId: null,
        gender: null,
        answers: {},
        ...overrides
    }
}

describe("aggregateSurvey", () => {
    const yesNo = q(1, "yes_no", { type: "yes_no" })
    const rating = q(2, "rating", { type: "rating", min: 1, max: 5 })
    const questions = [yesNo, rating]

    const r1 = response({
        responseId: 101,
        roleTags: ["captain"],
        divisionId: 10,
        gender: "male",
        answers: { 1: true, 2: 4 }
    })
    const r2 = response({
        responseId: 102,
        roleTags: ["rostered"],
        divisionId: 10,
        gender: "non_male",
        answers: { 1: false, 2: 3 }
    })
    const r3 = response({
        responseId: 103,
        roleTags: ["captain", "rostered"],
        divisionId: 20,
        gender: "male",
        answers: { 1: true, 2: 5 }
    })

    it("handles an empty response set", () => {
        const report = aggregateSurvey({
            questions,
            responses: [],
            invited: 0,
            filter: {},
            anonymous: false
        })
        expect(report.invited).toBe(0)
        expect(report.submitted).toBe(0)
        expect(report.responseRate).toBeNull()
        expect(report.filteredCount).toBe(0)
        expect(report.suppressed).toBe(false)
        expect(report.byQuestion).toEqual([
            {
                question: yesNo,
                aggregate: {
                    type: "yes_no",
                    answered: 0,
                    yes: 0,
                    no: 0,
                    yesPct: null
                }
            },
            {
                question: rating,
                aggregate: {
                    type: "rating",
                    answered: 0,
                    mean: null,
                    median: null,
                    distribution: [],
                    nps: null
                }
            }
        ])
    })

    it("aggregates all responses with no filter", () => {
        const report = aggregateSurvey({
            questions,
            responses: [r1, r2, r3],
            invited: 10,
            filter: {},
            anonymous: true
        })
        expect(report.submitted).toBe(3)
        expect(report.responseRate).toBe(30)
        expect(report.filteredCount).toBe(3)
        expect(report.suppressed).toBe(false)
        expect(report.byQuestion[0].aggregate).toEqual({
            type: "yes_no",
            answered: 3,
            yes: 2,
            no: 1,
            yesPct: 66.7
        })
        expect(report.byQuestion[1].aggregate).toEqual({
            type: "rating",
            answered: 3,
            mean: 4,
            median: 4,
            distribution: [
                { value: 3, count: 1 },
                { value: 4, count: 1 },
                { value: 5, count: 1 }
            ],
            nps: null
        })
    })

    it("suppresses a small filtered cell on an anonymous survey", () => {
        const report = aggregateSurvey({
            questions,
            responses: [r1, r2, r3],
            invited: 10,
            filter: { roleTag: "captain" },
            anonymous: true
        })
        expect(report.filteredCount).toBe(2)
        expect(report.suppressed).toBe(true)
        expect(report.byQuestion[0].aggregate).toEqual({
            type: "yes_no",
            answered: 0,
            yes: 0,
            no: 0,
            yesPct: null
        })
        expect(report.byQuestion[1].aggregate).toEqual({
            type: "rating",
            answered: 0,
            mean: null,
            median: null,
            distribution: [],
            nps: null
        })
    })

    it("does not suppress a non-anonymous survey even with a small filtered cell", () => {
        const report = aggregateSurvey({
            questions,
            responses: [r1, r2, r3],
            invited: 10,
            filter: { roleTag: "captain" },
            anonymous: false
        })
        expect(report.filteredCount).toBe(2)
        expect(report.suppressed).toBe(false)
        expect(report.byQuestion[0].aggregate).toEqual({
            type: "yes_no",
            answered: 2,
            yes: 2,
            no: 0,
            yesPct: 100
        })
        expect(report.byQuestion[1].aggregate).toEqual({
            type: "rating",
            answered: 2,
            mean: 4.5,
            median: 4.5,
            distribution: [
                { value: 4, count: 1 },
                { value: 5, count: 1 }
            ],
            nps: null
        })
    })

    it("respects a custom minCell", () => {
        const report = aggregateSurvey({
            questions,
            responses: [r1, r2, r3],
            invited: 10,
            filter: { roleTag: "captain" },
            anonymous: true,
            minCell: 1
        })
        expect(report.filteredCount).toBe(2)
        expect(report.suppressed).toBe(false)
    })

    it("never suppresses when the filter is empty, regardless of anonymity", () => {
        const report = aggregateSurvey({
            questions,
            responses: [r1],
            invited: 10,
            filter: {},
            anonymous: true,
            minCell: 5
        })
        expect(report.filteredCount).toBe(1)
        expect(report.suppressed).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// trendValues
// ---------------------------------------------------------------------------

describe("trendValues", () => {
    it("returns an empty list for a section", () => {
        const section = q(1, "section", { type: "section" })
        expect(trendValues(section, { type: "section", answered: 0 })).toEqual(
            []
        )
    })

    it("returns Yes % for yes_no", () => {
        const yesNo = q(1, "yes_no", { type: "yes_no" })
        expect(
            trendValues(yesNo, {
                type: "yes_no",
                answered: 3,
                yes: 2,
                no: 1,
                yesPct: 66.7
            })
        ).toEqual([{ key: "yes", label: "Yes %", value: 66.7 }])
    })

    it("returns only Average when a rating question has no NPS", () => {
        const rating = q(1, "rating", { type: "rating", min: 1, max: 5 })
        expect(
            trendValues(rating, {
                type: "rating",
                answered: 3,
                mean: 4,
                median: 4,
                distribution: [],
                nps: null
            })
        ).toEqual([{ key: "mean", label: "Average", value: 4 }])
    })

    it("returns Average and NPS for a nps-preset rating question", () => {
        const rating = q(1, "rating", {
            type: "rating",
            min: 0,
            max: 10,
            preset: "nps"
        })
        expect(
            trendValues(rating, {
                type: "rating",
                answered: 7,
                mean: 7.57,
                median: 8,
                distribution: [],
                nps: { promoters: 3, passives: 2, detractors: 2, score: 14 }
            })
        ).toEqual([
            { key: "mean", label: "Average", value: 7.57 },
            { key: "nps", label: "NPS", value: 14 }
        ])
    })

    it("returns Average (1-5) and Agree % for likert", () => {
        const likert = q(1, "likert", {
            type: "likert",
            options: LIKERT_OPTIONS
        })
        expect(
            trendValues(likert, {
                type: "likert",
                answered: 5,
                options: [],
                mean: 3.6,
                topBoxPct: 60
            })
        ).toEqual([
            { key: "mean", label: "Average (1-5)", value: 3.6 },
            { key: "topbox", label: "Agree %", value: 60 }
        ])
    })

    it("returns one series definition per option for single_choice", () => {
        const single = q(1, "single_choice", {
            type: "single_choice",
            options: CHOICES
        })
        expect(
            trendValues(single, {
                type: "single_choice",
                answered: 4,
                options: [
                    { key: "opt_a", label: "Alpha", count: 2, pct: 50 },
                    { key: "opt_b", label: "Bravo", count: 1, pct: 25 },
                    { key: "opt_c", label: "Charlie", count: 1, pct: 25 }
                ]
            })
        ).toEqual([
            { key: "opt:opt_a", label: "Alpha %", value: 50 },
            { key: "opt:opt_b", label: "Bravo %", value: 25 },
            { key: "opt:opt_c", label: "Charlie %", value: 25 }
        ])
    })

    it("returns one series definition per option for ranking", () => {
        const ranking = q(1, "ranking", { type: "ranking", options: CHOICES })
        expect(
            trendValues(ranking, {
                type: "ranking",
                answered: 2,
                options: [
                    {
                        key: "opt_a",
                        label: "Alpha",
                        averagePosition: 1.5,
                        firstPlace: 1
                    },
                    {
                        key: "opt_b",
                        label: "Bravo",
                        averagePosition: 1.5,
                        firstPlace: 1
                    },
                    {
                        key: "opt_c",
                        label: "Charlie",
                        averagePosition: 3,
                        firstPlace: 0
                    }
                ]
            })
        ).toEqual([
            { key: "rank:opt_a", label: "Alpha avg position", value: 1.5 },
            { key: "rank:opt_b", label: "Bravo avg position", value: 1.5 },
            { key: "rank:opt_c", label: "Charlie avg position", value: 3 }
        ])
    })

    it("returns Responses for text", () => {
        const text = q(1, "text", { type: "text", variant: "long" })
        expect(
            trendValues(text, {
                type: "text",
                answered: 2,
                answers: ["a", "b"]
            })
        ).toEqual([{ key: "count", label: "Responses", value: 2 }])
    })
})

// ---------------------------------------------------------------------------
// buildTrend
// ---------------------------------------------------------------------------

describe("buildTrend", () => {
    it("sorts instances by orderKey and fills nulls for a missing question", () => {
        const single = q(5, "single_choice", {
            type: "single_choice",
            options: CHOICES
        })

        const aggC = aggregateQuestion(single, ["opt_a", "opt_a", "opt_b"])
        const aggA = aggregateQuestion(single, [
            "opt_a",
            "opt_b",
            "opt_a",
            "opt_c"
        ])

        const instA: TrendInstance = {
            surveyId: 1,
            label: "Summer",
            orderKey: 1,
            submitted: 4,
            aggregates: { 5: aggA }
        }
        const instB: TrendInstance = {
            surveyId: 2,
            label: "Fall",
            orderKey: 2,
            submitted: 0,
            aggregates: {}
        }
        const instC: TrendInstance = {
            surveyId: 3,
            label: "Spring",
            orderKey: 0,
            submitted: 3,
            aggregates: { 5: aggC }
        }

        const trends = buildTrend([single], [instA, instB, instC])
        expect(trends).toHaveLength(1)
        const [trend] = trends
        expect(trend.question).toBe(single)
        expect(trend.series).toHaveLength(3)

        const byKey = Object.fromEntries(trend.series.map((s) => [s.key, s]))

        expect(byKey["opt:opt_a"].label).toBe("Alpha %")
        expect(byKey["opt:opt_a"].points).toEqual([
            { surveyId: 3, label: "Spring", value: 66.7, n: 3 },
            { surveyId: 1, label: "Summer", value: 50, n: 4 },
            { surveyId: 2, label: "Fall", value: null, n: 0 }
        ])

        expect(byKey["opt:opt_b"].points).toEqual([
            { surveyId: 3, label: "Spring", value: 33.3, n: 3 },
            { surveyId: 1, label: "Summer", value: 25, n: 4 },
            { surveyId: 2, label: "Fall", value: null, n: 0 }
        ])

        expect(byKey["opt:opt_c"].points).toEqual([
            { surveyId: 3, label: "Spring", value: 0, n: 3 },
            { surveyId: 1, label: "Summer", value: 25, n: 4 },
            { surveyId: 2, label: "Fall", value: null, n: 0 }
        ])
    })

    it("returns an empty series list for a section question", () => {
        const section = q(1, "section", { type: "section" })
        const trends = buildTrend([section], [])
        expect(trends).toEqual([{ question: section, series: [] }])
    })
})

// ---------------------------------------------------------------------------
// buildResponsesCsv
// ---------------------------------------------------------------------------

describe("buildResponsesCsv", () => {
    const section = q(10, "section", { type: "section" })
    const yesNo = q(
        1,
        "yes_no",
        { type: "yes_no" },
        { prompt: "Did you enjoy?" }
    )
    const rating = q(
        2,
        "rating",
        { type: "rating", min: 0, max: 10 },
        { prompt: "Rate us" }
    )
    const single = q(
        3,
        "single_choice",
        { type: "single_choice", options: CHOICES },
        { prompt: "Favorite?" }
    )
    const multi = q(
        4,
        "multi_choice",
        { type: "multi_choice", options: CHOICES },
        { prompt: "Interests?" }
    )
    const ranking = q(
        5,
        "ranking",
        { type: "ranking", options: CHOICES },
        { prompt: "Rank these" }
    )
    const text = q(
        6,
        "text",
        { type: "text", variant: "long" },
        { prompt: "Comments" }
    )
    const likert = q(
        7,
        "likert",
        { type: "likert", options: LIKERT_OPTIONS },
        { prompt: "Agree?" }
    )
    const questions = [
        section,
        yesNo,
        rating,
        single,
        multi,
        ranking,
        text,
        likert
    ]

    const resp1 = {
        ...response({
            responseId: 101,
            submittedOn: "2026-01-05T00:00:00Z",
            roleTags: ["captain", "rostered"] as const,
            divisionId: 10,
            gender: "male" as const,
            answers: {
                1: true,
                2: 8,
                3: "opt_b",
                4: ["opt_a", "opt_c"],
                5: ["opt_b", "opt_a", "opt_c"],
                6: "Great season",
                7: "agree"
            }
        }),
        name: "Josh Lukens",
        email: "josh@example.com"
    }

    const resp2 = {
        ...response({
            responseId: 102,
            submittedOn: null,
            roleTags: [],
            divisionId: null,
            gender: null,
            answers: {}
        }),
        name: "Anon Player",
        email: "anon@example.com"
    }

    it("includes Name and Email and formats each answer type when not anonymous", () => {
        const csv = buildResponsesCsv(questions, [resp1, resp2], {
            anonymous: false
        })
        expect(csv.headers).toEqual([
            "Response ID",
            "Submitted on",
            "Role tags",
            "Division ID",
            "Gender",
            "Name",
            "Email",
            "Did you enjoy?",
            "Rate us",
            "Favorite?",
            "Interests?",
            "Rank these",
            "Comments",
            "Agree?"
        ])
        expect(csv.rows[0]).toEqual([
            101,
            "2026-01-05T00:00:00Z",
            "captain; rostered",
            10,
            "male",
            "Josh Lukens",
            "josh@example.com",
            "Yes",
            8,
            "Bravo",
            "Alpha; Charlie",
            "Bravo > Alpha > Charlie",
            "Great season",
            "Agree"
        ])
        expect(csv.rows[1]).toEqual([
            102,
            null,
            "",
            null,
            null,
            "Anon Player",
            "anon@example.com",
            "",
            "",
            "",
            "",
            "",
            "",
            ""
        ])
    })

    it("omits Name and Email when anonymous", () => {
        const csv = buildResponsesCsv(questions, [resp1], { anonymous: true })
        expect(csv.headers).toEqual([
            "Response ID",
            "Submitted on",
            "Role tags",
            "Division ID",
            "Gender",
            "Did you enjoy?",
            "Rate us",
            "Favorite?",
            "Interests?",
            "Rank these",
            "Comments",
            "Agree?"
        ])
        expect(csv.rows[0]).toEqual([
            101,
            "2026-01-05T00:00:00Z",
            "captain; rostered",
            10,
            "male",
            "Yes",
            8,
            "Bravo",
            "Alpha; Charlie",
            "Bravo > Alpha > Charlie",
            "Great season",
            "Agree"
        ])
    })
})
