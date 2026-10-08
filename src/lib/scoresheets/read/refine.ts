/**
 * refine.ts — find each game's printed boxes near where the page fit put them.
 *
 * `locatePage()` fits one plane to the four corner marks. That is exact for a
 * flat page and nowhere else, and real sheets are not flat: the first folded
 * photographs had the middle of the page sunk away from the camera, so the
 * FINAL boxes sat 15-35pt from where the plane said, while the marks were
 * perfect. A digit box is 13pt, so every crop landed on the printed tally
 * numbers above it, and a model read those as a score.
 *
 * So the plane is treated as a first guess and each game's boxes are looked
 * for around it, by their printed outlines. In two stages, because the obvious
 * single stage has a trap: one team's FINAL row and the next team's are
 * identical and only 44-60pt apart, so a search wide enough to absorb the bend
 * is wide enough to land on the wrong team. The coarse stage therefore matches
 * a game's home and away boxes together, with their spacing allowed to shrink
 * as a bent page shrinks it. Slipping a whole row lines up only half of that
 * shape, so it cannot win. The fine stage then settles each pair, and its WIN
 * box, within a few points.
 *
 * A box that cannot be found is reported rather than guessed at. Reading the
 * wrong place is worse than not reading: the paper there has printed numbers
 * on it, and those are legal scores.
 */

import type { BoxRect, GameGeometry, SheetGeometry } from "../layout"
import { cropId } from "./crops"
import type { Matrix3 } from "./homography"
import { type RasterImage, sampleRect } from "./image"

/** Resolution the search runs at, in pixels per page point. */
const PX_PER_PT = 4
/**
 * How far from the page fit a box may be found, in points. Games sit 130pt
 * apart across the page, so sideways there is room to spare. Down the page the
 * next match's boxes are at least 118pt away, and the coarse stage cannot
 * confuse the two rows of its own game.
 */
const SEARCH_X = 30
const SEARCH_Y = 35
const COARSE_STEP = 1
/**
 * A bent page changes local scale, and two different ways at once. The boxes
 * shrink or grow (to about 0.8 of printed size on the strongest synthetic
 * folds), and separately the gap between a game's two rows stretches or
 * squeezes; on one block the boxes were 0.88 while the gap was unchanged. One
 * scale cannot express that, and an outline of the wrong size straddles the
 * printed line and scores as if it were in the wrong place, so both are
 * searched.
 */
const SIZES = [0.8, 0.9, 1, 1.1, 1.2]
const SPREADS = [0.8, 0.9, 1, 1.1, 1.2]
const FINE_SIZE_STEP = 0.03
const FINE_RADIUS = 3
/**
 * The WIN box sits 32pt from its pair, so any error in the pair's scale is
 * multiplied by that distance before the box is looked for.
 */
const WIN_RADIUS = 6
const FINE_STEP = 0.25

/** Band centred on a printed edge: the 1.1pt line plus blur. */
const LINE_BAND = 1.6
/**
 * The coarse stage's band is wider, so a candidate half a grid step or a size
 * step off the truth still scores as nearly right. With the narrow band a
 * sparse grid could step straight over the true position, and the best
 * remaining candidate was the printed tally numbers.
 */
const COARSE_LINE_BAND = 2.4
/** Clear paper between the line band and the rings either side of it. */
const RING_GAP = 0.6
const RING_WIDTH = 1.2

/**
 * Minimum outline contrast for a box to count as found.
 *
 * Contrast is the darkness of a box's weakest side less the paper beside it,
 * as a fraction of the paper's brightness. Measured on the first folded
 * photographs: across 72 games the best-scoring placement anywhere at least
 * 8pt from the real boxes never reached 0.051, printed tally numbers included,
 * while the real boxes scored 0.11 to 0.44. This sits at about twice the worst
 * impostor.
 */
const MIN_CONTRAST = 0.1

interface Patch {
    /** The page rectangle the patch covers. */
    rect: BoxRect
    width: number
    height: number
    /** Summed-area table of darkness, (width+1) x (height+1). */
    sums: Float64Array
}

/**
 * Where a group of boxes landed, in page points: each box keeps its position
 * relative to the group's centre, with horizontal distances and widths scaled
 * by `sizeX`, heights by `sizeY`, vertical distances by `spread`, and the
 * whole shifted. Width and height scale separately because a half-page tilted
 * away from the camera is foreshortened one way and not the other: on a fold,
 * boxes near the page's edge came out 14.6pt wide and 11.7pt tall.
 */
interface Placement {
    cx: number
    cy: number
    sizeX: number
    sizeY: number
    spread: number
    dx: number
    dy: number
}

export interface RefinedGeometry {
    /** The same sheet with each game's boxes moved to where they were found. */
    geometry: SheetGeometry
    /**
     * Crop ids of games whose boxes could not be found. Their ink and ticks
     * are not to be trusted, so they must read as unreadable, never as blank.
     */
    unlocated: Set<string>
    /**
     * Crop ids of games whose digits were found but whose WIN box was not.
     * Referees circle and scribble over that box, which can hide its outline;
     * the digits still stand, but the tick must not be read.
     */
    uncheckedWins: Set<string>
}

/**
 * Darkness relative to the patch's own paper, which cancels exposure and any
 * shadow over this part of the page.
 */
function samplePatch(img: RasterImage, toImage: Matrix3, rect: BoxRect): Patch {
    const sample = sampleRect(img, toImage, rect, PX_PER_PT)
    const sorted = Uint8Array.from(sample.gray).sort()
    const paper = Math.max(1, sorted[Math.floor(sorted.length * 0.9)])

    const { width, height } = sample
    const sums = new Float64Array((width + 1) * (height + 1))
    for (let row = 0; row < height; row++) {
        let rowSum = 0
        for (let col = 0; col < width; col++) {
            const value = sample.gray[row * width + col]
            rowSum += Math.max(0, Math.min(1, (paper - value) / paper))
            sums[(row + 1) * (width + 1) + col + 1] =
                sums[row * (width + 1) + col + 1] + rowSum
        }
    }
    return { rect, width, height, sums }
}

/** Summed darkness and pixel count over a page rectangle. */
function areaSum(patch: Patch, r: BoxRect): [number, number] {
    const P = PX_PER_PT
    const top = patch.rect.y + patch.rect.h
    const clamp = (v: number, max: number) =>
        Math.max(0, Math.min(max, Math.round(v)))
    const c0 = clamp((r.x - patch.rect.x) * P, patch.width)
    const c1 = clamp((r.x + r.w - patch.rect.x) * P, patch.width)
    const r0 = clamp((top - (r.y + r.h)) * P, patch.height)
    const r1 = clamp((top - r.y) * P, patch.height)
    if (c1 <= c0 || r1 <= r0) return [0, 0]
    const w = patch.width + 1
    const sum =
        patch.sums[r1 * w + c1] -
        patch.sums[r0 * w + c1] -
        patch.sums[r1 * w + c0] +
        patch.sums[r0 * w + c0]
    return [sum, (c1 - c0) * (r1 - r0)]
}

function grow(r: BoxRect, by: number): BoxRect {
    return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 }
}

function place(r: BoxRect, p: Placement): BoxRect {
    const w = r.w * p.sizeX
    const h = r.h * p.sizeY
    const x = p.cx + (r.x + r.w / 2 - p.cx) * p.sizeX + p.dx
    const y = p.cy + (r.y + r.h / 2 - p.cy) * p.spread + p.dy
    return { x: x - w / 2, y: y - h / 2, w, h }
}

function centreOf(boxes: readonly BoxRect[]): { cx: number; cy: number } {
    const b = bounds(boxes, 0)
    return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 }
}

/** Mean darkness between two nested rectangles. */
function ringMean(patch: Patch, outer: BoxRect, inner: BoxRect): number {
    const [so, ao] = areaSum(patch, outer)
    const [si, ai] = areaSum(patch, inner)
    return ao > ai ? (so - si) / (ao - ai) : 0
}

/** Mean darkness over a page rectangle. */
function rectMean(patch: Patch, r: BoxRect): number {
    const [sum, area] = areaSum(patch, r)
    return area > 0 ? sum / area : 0
}

/**
 * Each side of a box as two half-length strips of the line band, corners
 * left out so that no strip is shared between sides.
 */
function sideStrips(box: BoxRect, half: number): BoxRect[] {
    const band = half * 2
    const innerW = box.w - band
    const innerH = box.h - band
    const strips: BoxRect[] = []
    for (const k of [0, 1]) {
        const x = box.x + half + (innerW / 2) * k
        const y = box.y + half + (innerH / 2) * k
        // bottom, top, left, right
        strips.push({ x, y: box.y - half, w: innerW / 2, h: band })
        strips.push({ x, y: box.y + box.h - half, w: innerW / 2, h: band })
        strips.push({ x: box.x - half, y, w: band, h: innerH / 2 })
        strips.push({ x: box.x + box.w - half, y, w: band, h: innerH / 2 })
    }
    return strips
}

/**
 * How strongly a run of adjacent boxes' outlines show at this position.
 *
 * The line is scored by its weakest stretch, not its average. Every printed
 * side is dark along its whole length; a row of printed tally numbers is dark
 * only where a stroke happens to fall, and averaged around an outline those
 * strokes scored as well as a faint real box did. Requiring all sixteen half
 * sides of a pair to be dark is something numbers cannot fake, and a
 * handwritten stroke crossing a border only makes that side darker.
 *
 * The outside ring is taken around the whole run rather than each box: the
 * two FINAL boxes are 2pt apart, so each one's outside ring would lie on its
 * neighbour's border and mark the true position down.
 */
function outlineContrast(
    patch: Patch,
    boxes: readonly BoxRect[],
    band = LINE_BAND,
    /**
     * A score the caller already has. The result can never exceed the
     * weakest side, so once a side falls to this the answer cannot win and
     * the rest is not measured. Most candidates in a search stop at the first
     * side or two, which is what makes the search affordable.
     */
    floor = Number.NEGATIVE_INFINITY
): number {
    const half = band / 2
    let line = Number.POSITIVE_INFINITY
    let inside = 0
    for (const box of boxes) {
        for (const strip of sideStrips(box, half)) {
            line = Math.min(line, rectMean(patch, strip))
            if (line <= floor) return line
        }
        inside += ringMean(
            patch,
            grow(box, -half - RING_GAP),
            grow(box, -half - RING_GAP - RING_WIDTH)
        )
    }
    const left = Math.min(...boxes.map((b) => b.x))
    const bottom = Math.min(...boxes.map((b) => b.y))
    const run: BoxRect = {
        x: left,
        y: bottom,
        w: Math.max(...boxes.map((b) => b.x + b.w)) - left,
        h: Math.max(...boxes.map((b) => b.y + b.h)) - bottom
    }
    const outside = ringMean(
        patch,
        grow(run, half + RING_GAP + RING_WIDTH),
        grow(run, half + RING_GAP)
    )
    inside /= boxes.length
    // Paper is whichever ring is cleaner. Big handwriting fills the inside
    // ring and the FINAL and WIN labels crowd the outside one, but rarely
    // both at once.
    return line - Math.min(inside, outside)
}

function bounds(boxes: readonly BoxRect[], margin: number): BoxRect {
    const left = Math.min(...boxes.map((b) => b.x)) - margin
    const bottom = Math.min(...boxes.map((b) => b.y)) - margin
    const right = Math.max(...boxes.map((b) => b.x + b.w)) + margin
    const top = Math.max(...boxes.map((b) => b.y + b.h)) + margin
    return { x: left, y: bottom, w: right - left, h: top - bottom }
}

/**
 * The best placement over a grid of shifts and scales. Every group must show
 * its outline: a placement is only as good as its weakest group, so lining up
 * one row of a game well cannot make up for missing the other.
 */
function search(
    patch: Patch,
    groups: readonly (readonly BoxRect[])[],
    around: Placement,
    opts: {
        radiusX: number
        radiusY: number
        step: number
        band?: number
        /** Pairs of [sizeX, sizeY] to try. */
        sizes: readonly (readonly [number, number])[]
        spreads: readonly number[]
    }
): Placement & { contrast: number } {
    let best = { ...around, contrast: Number.NEGATIVE_INFINITY }
    for (const [sizeX, sizeY] of opts.sizes) {
        for (const spread of opts.spreads) {
            for (let dy = -opts.radiusY; dy <= opts.radiusY; dy += opts.step) {
                for (
                    let dx = -opts.radiusX;
                    dx <= opts.radiusX;
                    dx += opts.step
                ) {
                    const p = {
                        ...around,
                        sizeX,
                        sizeY,
                        spread,
                        dx: around.dx + dx,
                        dy: around.dy + dy
                    }
                    // Only as good as the weakest group, so stop at the first
                    // one that cannot beat the best placement so far.
                    let contrast = Number.POSITIVE_INFINITY
                    for (const boxes of groups) {
                        contrast = Math.min(
                            contrast,
                            outlineContrast(
                                patch,
                                boxes.map((b) => place(b, p)),
                                opts.band,
                                best.contrast
                            )
                        )
                        if (contrast <= best.contrast) break
                    }
                    if (contrast > best.contrast) best = { ...p, contrast }
                }
            }
        }
    }
    return best
}

/**
 * Coarse stage for one game column of one match: both teams' FINAL boxes as
 * one shape, so the search cannot settle on one row of a neighbouring team.
 */
function coarse(
    patch: Patch,
    home: GameGeometry,
    away: GameGeometry,
    near: Pick<Placement, "dx" | "dy"> & {
        radiusX: number
        radiusY: number
    } = {
        dx: 0,
        dy: 0,
        radiusX: SEARCH_X,
        radiusY: SEARCH_Y
    }
): Placement & { contrast: number } {
    const boxes = [...home.finalDigits, ...away.finalDigits]
    const best = search(
        patch,
        [home.finalDigits, away.finalDigits],
        {
            ...centreOf(boxes),
            sizeX: 1,
            sizeY: 1,
            spread: 1,
            dx: near.dx,
            dy: near.dy
        },
        {
            radiusX: near.radiusX,
            radiusY: near.radiusY,
            step: COARSE_STEP,
            band: COARSE_LINE_BAND,
            // Square at this stage; the fine stage lets them differ.
            sizes: SIZES.map((s) => [s, s] as const),
            spreads: SPREADS
        }
    )
    // The best score sitting on the edge of the window is not a peak: the
    // boxes are probably further out than the window reaches, and what
    // scored best is whatever printing happened to be inside it. On a
    // crowded playoff page that is the next team's row.
    const atEdge =
        Math.abs(best.dx - near.dx) >= near.radiusX - COARSE_STEP ||
        Math.abs(best.dy - near.dy) >= near.radiusY - COARSE_STEP
    return atEdge ? { ...best, contrast: Number.NEGATIVE_INFINITY } : best
}

/**
 * Fallback when a game's two rows cannot both be found: look for one row on
 * its own, never further up or down than halfway to the other row, so a
 * missing row cannot be "found" on top of the one that is there.
 */
function coarseRow(
    patch: Patch,
    game: GameGeometry,
    rowGap: number
): Placement & { contrast: number } {
    const radiusY = Math.min(SEARCH_Y, rowGap * 0.45)
    const best = search(
        patch,
        [game.finalDigits],
        {
            ...centreOf(game.finalDigits),
            sizeX: 1,
            sizeY: 1,
            spread: 1,
            dx: 0,
            dy: 0
        },
        {
            radiusX: SEARCH_X,
            radiusY,
            step: COARSE_STEP,
            band: COARSE_LINE_BAND,
            sizes: SIZES.map((s) => [s, s] as const),
            spreads: [1]
        }
    )
    // As in `coarse`: a best score on the window's edge is not a peak.
    const atEdge =
        Math.abs(best.dx) >= SEARCH_X - COARSE_STEP ||
        Math.abs(best.dy) >= radiusY - COARSE_STEP
    return atEdge ? { ...best, contrast: Number.NEGATIVE_INFINITY } : best
}

/** Fine stage: one team's pair, then its WIN box from where the pair landed. */
function fine(
    patch: Patch,
    game: GameGeometry,
    guess: Placement
): { game: GameGeometry; found: boolean; winFound: boolean } {
    // Re-centre on this pair, keeping where the coarse stage put it.
    const centre = centreOf(game.finalDigits)
    const landed = centreOf(game.finalDigits.map((b) => place(b, guess)))
    const start: Placement = {
        ...centre,
        sizeX: guess.sizeX,
        sizeY: guess.sizeY,
        spread: 1,
        dx: landed.cx - centre.cx,
        dy: landed.cy - centre.cy
    }
    // Position, then size at that position, then position again for the new
    // size: three small searches instead of every combination of the two.
    const settle = (from: Placement, radius: number) =>
        search(patch, [game.finalDigits], from, {
            radiusX: radius,
            radiusY: radius,
            step: FINE_STEP,
            sizes: [[from.sizeX, from.sizeY]],
            spreads: [1]
        })
    // Wide, because it is cheap here (one position) and a strong fold
    // stretches a pair well past the coarse stage's nearest size.
    const steps = Array.from({ length: 17 }, (_, i) => (i - 8) * FINE_SIZE_STEP)
    const placed = settle(start, FINE_RADIUS)
    const sized = search(patch, [game.finalDigits], placed, {
        radiusX: 0,
        radiusY: 0,
        step: FINE_STEP,
        sizes: steps.flatMap((kx) =>
            steps.map((ky) => [placed.sizeX + kx, placed.sizeY + ky] as const)
        ),
        spreads: [1]
    })
    const pair = settle(sized, 1)
    // The WIN box is placed from the pair's centre, so its 32pt offset is
    // scaled with the pair, then settled on its own outline.
    const win = search(patch, [[game.win]], pair, {
        radiusX: WIN_RADIUS,
        radiusY: WIN_RADIUS,
        step: FINE_STEP,
        sizes: [[pair.sizeX, pair.sizeY]],
        spreads: [1]
    })

    const pairBoxes = (boxes: readonly BoxRect[]) =>
        boxes.map((b) => place(b, pair)) as [BoxRect, BoxRect]
    const winFound = win.contrast >= MIN_CONTRAST
    return {
        game: {
            ...game,
            finalDigits: pairBoxes(game.finalDigits),
            timeouts: pairBoxes(game.timeouts),
            // Unfound, it stays where the pair puts it; nothing reads it then.
            win: place(game.win, winFound ? win : pair),
            tally: { ...game.tally, ...place(game.tally, pair) }
        },
        found: pair.contrast >= MIN_CONTRAST,
        winFound
    }
}

/**
 * How far one game's shift may stray from the games that should move with it.
 *
 * Each direction has its own neighbours. The games of one match sit side by
 * side on one strip of paper and move up or down together: on the folded
 * photographs within about 6pt, while their sideways shifts differed by 27pt,
 * because a fold pinches the page towards its middle. Sideways, the same game
 * in the matches above and below moves together instead, within about 9pt.
 */
const MAX_DISAGREEMENT = 12
const RECHECK_RADIUS = 8

/**
 * The value most of `values` agree on, within `MAX_DISAGREEMENT`, as their
 * mean; null when no two agree. A vote rather than a median: with three
 * values and one wrong, the median of the other two is as likely to be the
 * wrong one.
 */
function consensus(values: readonly number[]): number | null {
    let best: number[] = []
    for (const v of values) {
        const agreeing = values.filter(
            (w) => Math.abs(w - v) <= MAX_DISAGREEMENT
        )
        if (agreeing.length > best.length) best = agreeing
    }
    if (best.length < 2) return null
    return best.reduce((sum, v) => sum + v, 0) / best.length
}

export function refineGameBoxes(
    img: RasterImage,
    toImage: Matrix3,
    geometry: SheetGeometry
): RefinedGeometry {
    const unlocated = new Set<string>()
    const uncheckedWins = new Set<string>()
    const refined = new Map<string, GameGeometry>()

    const key = (g: GameGeometry) => cropId(g.matchId, g.team, g.game)
    const byKey = new Map(geometry.games.map((g) => [key(g), g]))

    interface Column {
        home: GameGeometry
        away: GameGeometry
        patch: Patch
        guess: Placement & { contrast: number }
    }
    const columns: Column[] = []

    for (const home of geometry.games) {
        if (home.team !== "home") continue
        const away = byKey.get(cropId(home.matchId, "away", home.game))
        if (!away) continue

        // One patch covers both rows, their WIN boxes, and the search around
        // them, so every stage below reads from the same sampled pixels.
        const margin =
            Math.max(SEARCH_X, SEARCH_Y) +
            Math.max(FINE_RADIUS, WIN_RADIUS) +
            COARSE_LINE_BAND +
            RING_GAP +
            RING_WIDTH
        const patch = samplePatch(
            img,
            toImage,
            bounds(
                [...home.finalDigits, home.win, ...away.finalDigits, away.win],
                margin
            )
        )
        columns.push({ home, away, patch, guess: coarse(patch, home, away) })
    }

    // A column that moved a long way from the columns that should move with
    // it has most likely settled on printed numbers; look again where they
    // agree. Every expectation is taken before any column is moved again.
    const trusted = columns.filter((c) => c.guess.contrast >= MIN_CONTRAST)
    const expected = columns.map((column) => ({
        dy: consensus(
            trusted
                .filter((c) => c.home.matchId === column.home.matchId)
                .map((c) => c.guess.dy)
        ),
        dx: consensus(
            trusted
                .filter((c) => c.home.game === column.home.game)
                .map((c) => c.guess.dx)
        )
    }))
    columns.forEach((column, i) => {
        const { dx, dy } = expected[i]
        const strays =
            (dy !== null &&
                Math.abs(column.guess.dy - dy) > MAX_DISAGREEMENT) ||
            (dx !== null && Math.abs(column.guess.dx - dx) > MAX_DISAGREEMENT)
        if (!strays) return
        column.guess = coarse(column.patch, column.home, column.away, {
            dx: dx ?? column.guess.dx,
            dy: dy ?? column.guess.dy,
            radiusX: RECHECK_RADIUS,
            radiusY: RECHECK_RADIUS
        })
    })

    for (const { home, away, patch, guess } of columns) {
        const rowGap = home.finalDigits[0].y - away.finalDigits[0].y
        const results = [home, away].map((game) => {
            if (guess.contrast >= MIN_CONTRAST) return fine(patch, game, guess)
            const row = coarseRow(patch, game, rowGap)
            const result = fine(patch, game, row)
            return row.contrast >= MIN_CONTRAST
                ? result
                : { ...result, found: false }
        })

        // Two rows that ended up on the same printed boxes have not both been
        // found, whatever their contrast says: one would be read as the other.
        const [h, a] = results.map((r) => centreOf(r.game.finalDigits))
        const merged = Math.abs(h.cy - a.cy) < rowGap * 0.6

        for (const [game, result] of [
            [home, results[0]],
            [away, results[1]]
        ] as const) {
            refined.set(key(game), result.game)
            if (!result.found || merged) unlocated.add(key(game))
            else if (!result.winFound) uncheckedWins.add(key(game))
        }
    }

    return {
        geometry: {
            ...geometry,
            games: geometry.games.map((g) => refined.get(key(g)) ?? g)
        },
        unlocated,
        uncheckedWins
    }
}
