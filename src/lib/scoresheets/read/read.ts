/**
 * read.ts — the whole read, in one pure function.
 *
 * Takes a photograph and a description of the sheet it should be, and returns
 * what it can make out. No database, no storage, no network: the transcriber
 * arrives as an argument, so every stage of this can be tested with known
 * inputs and known answers.
 *
 * Deliberately never produces a score it is not willing to defend. Each field
 * carries a level, and only `high` means "offer this without comment".
 */

import { buildSheetGeometry, type SheetGeometry } from "../layout"
import type { CourtSheet, SheetEventType, SheetMatch } from "../types"
import { readCheckbox } from "./checkbox"
import { cropId, cropScoreBoxes, type ScoreCrop } from "./crops"
import { readSheetTag, type SheetTagParts } from "./identity"
import type { RasterImage } from "./image"
import { locatePage, type PageTransform } from "./locate"
import {
    type GameVerdict,
    type MatchVerdict,
    reconcileGame,
    reconcileMatch,
    type ScoreCandidate
} from "./reconcile"
import { gameConstraint } from "./rules"
import { validateReadings } from "./transcriber/port"
import type { Transcriber } from "./transcriber/port"

export type ReadStatus =
    | "read"
    | "needs_review"
    | "unidentified"
    | "not_located"
    | "failed"

export interface MatchRead extends MatchVerdict {
    matchId: number
    orderOnCourt: number
}

export interface SheetRead {
    status: ReadStatus
    /** What the page says it is, when the tag could be decoded. */
    tag: string | null
    identity: SheetTagParts | null
    locate: {
        method: PageTransform["method"]
        fiducialsFound: number
        residualPt: number
    } | null
    matches: MatchRead[]
    /** Crops of anything a human should look at, keyed by field. */
    crops: ScoreCrop[]
    /** Plain-language reasons this needs attention. */
    problems: string[]
    transcriber: string
}

export interface ReadInput {
    image: RasterImage
    /** The layout the sheet was printed with, from its print record. */
    matchIds: number[]
    eventType: SheetEventType
    transcriber: Transcriber
    signal?: AbortSignal
}

/**
 * Geometry depends only on how many matches a sheet carried and what kind of
 * night it was, so a handful of ids is enough to rebuild the exact page.
 */
export function geometryForPrint(
    matchIds: readonly number[],
    eventType: SheetEventType
): SheetGeometry {
    const matches: SheetMatch[] = matchIds.map((matchId, index) => ({
        matchId,
        orderOnCourt: index + 1,
        divisionName: "",
        time: null,
        playoff: eventType === "playoff",
        playoffMatchNum: null,
        bracket: null,
        home: { teamId: null, name: "", isPlaceholder: true, captains: [] },
        away: { teamId: null, name: "", isPlaceholder: true, captains: [] },
        referee: null,
        backupReferee: null,
        workTeam: null
    }))
    const sheet: CourtSheet = { court: null, matches }
    return buildSheetGeometry(sheet, eventType)
}

export async function readSheet(input: ReadInput): Promise<SheetRead> {
    const geometry = geometryForPrint(input.matchIds, input.eventType)

    const transform = locatePage(input.image)
    if (!transform) {
        return {
            status: "not_located",
            tag: null,
            identity: null,
            locate: null,
            matches: [],
            crops: [],
            problems: [
                "Could not find the page in this photo. Retake it with all four corner marks visible."
            ],
            transcriber: input.transcriber.name
        }
    }

    const locate = {
        method: transform.method,
        fiducialsFound: transform.fiducialsFound,
        residualPt: transform.residualPt
    }
    const problems: string[] = []

    const identity = readSheetTag(input.image, transform, geometry.tagQr)
    if (!identity) {
        problems.push(
            "The sheet's code could not be read, so which court this is must be confirmed by hand."
        )
    }

    // Ink first, then the transcriber. A box we believe is empty is never
    // shown to a model, so an empty game cannot acquire a score.
    const { written, blank } = cropScoreBoxes(
        input.image,
        transform.toImage,
        geometry,
        input.eventType
    )

    let candidates = new Map<string, ScoreCandidate>()
    let transcriberName = input.transcriber.name
    if (written.length > 0) {
        try {
            const raw = await input.transcriber.transcribe(
                written,
                input.signal
            )
            const digitsById = new Map(
                written.map((c) => [c.id, c.digitsWritten])
            )
            candidates = new Map(
                validateReadings(written, raw).map((r) => [
                    r.id,
                    {
                        value: r.value,
                        confidence: r.confidence,
                        alternatives: r.alternatives,
                        digitsWritten: digitsById.get(r.id)
                    }
                ])
            )
        } catch (error) {
            // The deterministic half still stands, so carry on without digits
            // rather than losing the ticks too.
            transcriberName = `${input.transcriber.name} (failed)`
            problems.push(
                `Handwriting could not be read: ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }
    }

    const blankIds = new Set(blank)
    const matches: MatchRead[] = input.matchIds.map((matchId, index) => {
        const games: GameVerdict[] = ([1, 2, 3] as const).map((game) => {
            const constraint = gameConstraint(input.eventType, game)
            const cell = (team: "home" | "away") => {
                const id = cropId(matchId, team, game)
                // Null means "this box is empty paper", and only the ink may
                // say that. A box the transcriber gave no answer for has ink
                // in it and is merely unreadable, so it gets an empty
                // candidate instead. Returning null here would let a failed
                // model turn a played game into a confident "never played" —
                // the stub answers every crop, so only a real timeout or a
                // refused request ever took this path, and one did the first
                // time a real photograph went through.
                if (blankIds.has(id)) return null
                return candidates.get(id) ?? { value: null, confidence: 0 }
            }
            const tick = (team: "home" | "away") => {
                const box = geometry.games.find(
                    (g) =>
                        g.matchId === matchId &&
                        g.team === team &&
                        g.game === game
                )
                if (!box) {
                    return {
                        inkRatio: 0,
                        state: "unmarked" as const,
                        confidence: 0
                    }
                }
                return readCheckbox(input.image, transform.toImage, box.win)
            }

            return reconcileGame({
                constraint,
                home: cell("home"),
                away: cell("away"),
                homeWin: tick("home"),
                awayWin: tick("away")
            })
        })

        const verdict = reconcileMatch(games)
        return { ...verdict, matchId, orderOnCourt: index + 1 }
    })

    for (const match of matches) {
        for (const problem of match.problems) {
            problems.push(`Match ${match.orderOnCourt}: ${problem}`)
        }
    }
    if (transform.residualPt > 3) {
        problems.push(
            "The page looks bent or the photo is at a steep angle; check the numbers carefully."
        )
    }

    // A sheet nobody wrote on does not get photographed. Finding no ink at all
    // means the read failed — the page was located badly enough that every box
    // sampled blank paper — and reporting a confident "no games played" would
    // be the worst possible way to be wrong.
    if (written.length === 0 && blank.length > 0) {
        problems.push(
            "No scores were found anywhere on this sheet, which usually means the photo is too angled or blurred to read. Retake it square-on."
        )
    }

    const status: ReadStatus = !identity
        ? "unidentified"
        : problems.length > 0
          ? "needs_review"
          : "read"

    return {
        status,
        tag: identity?.text ?? null,
        identity: identity?.parts ?? null,
        locate,
        matches,
        crops: written,
        problems,
        transcriber: transcriberName
    }
}
