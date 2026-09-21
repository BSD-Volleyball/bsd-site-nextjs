/**
 * synthesize.ts — draw a score sheet straight to pixels, with known contents.
 *
 * Test-only. The point is that the ground truth is *generated*: the same
 * `buildSheetGeometry()` output the renderer draws from also tells this
 * harness where to put ink, so a test can assert the reader recovered exactly
 * what was drawn.
 *
 * Deliberately not by rasterising the real PDF. There is no pure-JS PDF
 * rasteriser in the dependency tree, and adding one plus a native canvas would
 * be flaky and would be the repo's only native dependency. The gap that leaves
 * — whether `render.ts` draws where `layout.ts` says — is closed by the
 * standing rule that the renderer may not hardcode a coordinate.
 */

import QRCode from "qrcode"

import {
    type BoxRect,
    buildSheetGeometry,
    PAGE_HEIGHT,
    PAGE_WIDTH,
    type SheetGeometry
} from "../../layout"
import { sheetTag } from "../../sheet-config"
import type { CourtSheet, SheetEventType, SheetMatch } from "../../types"
import type { RasterImage } from "../image"

export interface Canvas {
    width: number
    height: number
    gray: Uint8Array
    /** Pixels per PDF point. */
    scale: number
}

export function createCanvas(scale: number): Canvas {
    const width = Math.round(PAGE_WIDTH * scale)
    const height = Math.round(PAGE_HEIGHT * scale)
    return {
        width,
        height,
        gray: new Uint8Array(width * height).fill(255),
        scale
    }
}

export function toImage(canvas: Canvas): RasterImage {
    return { width: canvas.width, height: canvas.height, gray: canvas.gray }
}

/** Page space has y upward; pixels have y downward. */
function px(canvas: Canvas, x: number, y: number): [number, number] {
    return [x * canvas.scale, (PAGE_HEIGHT - y) * canvas.scale]
}

function put(canvas: Canvas, x: number, y: number, value: number) {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= canvas.width || iy >= canvas.height) return
    const i = iy * canvas.width + ix
    if (value < canvas.gray[i]) canvas.gray[i] = value
}

export function fillRect(canvas: Canvas, rect: BoxRect, value = 0) {
    const [x0, y1] = px(canvas, rect.x, rect.y)
    const [x1, y0] = px(canvas, rect.x + rect.w, rect.y + rect.h)
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
            put(canvas, x, y, value)
        }
    }
}

export function strokeRect(
    canvas: Canvas,
    rect: BoxRect,
    thicknessPt = 1,
    value = 0
) {
    const t = Math.max(1, thicknessPt * canvas.scale)
    const [x0, y1] = px(canvas, rect.x, rect.y)
    const [x1, y0] = px(canvas, rect.x + rect.w, rect.y + rect.h)
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
            const nearEdge =
                x - x0 < t || x1 - x < t || y - y0 < t || y1 - y < t
            if (nearEdge) put(canvas, x, y, value)
        }
    }
}

export function drawLine(
    canvas: Canvas,
    a: { x: number; y: number },
    b: { x: number; y: number },
    thicknessPt = 1,
    value = 0
) {
    const [ax, ay] = px(canvas, a.x, a.y)
    const [bx, by] = px(canvas, b.x, b.y)
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay)) * 2 + 1
    const r = Math.max(0.5, (thicknessPt * canvas.scale) / 2)
    for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const cx = ax + (bx - ax) * t
        const cy = ay + (by - ay) * t
        for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
            for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
                if (dx * dx + dy * dy <= r * r)
                    put(canvas, cx + dx, cy + dy, value)
            }
        }
    }
}

// --- digits ---------------------------------------------------------------

/** Seven-segment strokes, enough to put realistic ink in the right cell. */
const SEGMENTS: Record<number, string[]> = {
    0: ["top", "tl", "tr", "bl", "br", "bottom"],
    1: ["tr", "br"],
    2: ["top", "tr", "middle", "bl", "bottom"],
    3: ["top", "tr", "middle", "br", "bottom"],
    4: ["tl", "tr", "middle", "br"],
    5: ["top", "tl", "middle", "br", "bottom"],
    6: ["top", "tl", "middle", "bl", "br", "bottom"],
    7: ["top", "tr", "br"],
    8: ["top", "tl", "tr", "middle", "bl", "br", "bottom"],
    9: ["top", "tl", "tr", "middle", "br", "bottom"]
}

export function drawDigit(
    canvas: Canvas,
    digit: number,
    box: BoxRect,
    jitter = 0
) {
    const segs = SEGMENTS[digit]
    if (!segs) return

    const inset = box.w * 0.22
    const left = box.x + inset
    const right = box.x + box.w - inset
    const bottom = box.y + box.h * 0.18
    const top = box.y + box.h * 0.82
    const mid = (bottom + top) / 2
    const j = () => (jitter === 0 ? 0 : (Math.random() - 0.5) * jitter)

    const line = (ax: number, ay: number, bx: number, by: number) =>
        drawLine(
            canvas,
            { x: ax + j(), y: ay + j() },
            { x: bx + j(), y: by + j() },
            0.9
        )

    for (const seg of segs) {
        if (seg === "top") line(left, top, right, top)
        if (seg === "middle") line(left, mid, right, mid)
        if (seg === "bottom") line(left, bottom, right, bottom)
        if (seg === "tl") line(left, mid, left, top)
        if (seg === "tr") line(right, mid, right, top)
        if (seg === "bl") line(left, bottom, left, mid)
        if (seg === "br") line(right, bottom, right, mid)
    }
}

export function drawTick(canvas: Canvas, box: BoxRect) {
    const x0 = box.x + box.w * 0.2
    const x1 = box.x + box.w * 0.45
    const x2 = box.x + box.w * 0.82
    const y0 = box.y + box.h * 0.55
    const y1 = box.y + box.h * 0.2
    const y2 = box.y + box.h * 0.85
    drawLine(canvas, { x: x0, y: y0 }, { x: x1, y: y1 }, 1.1)
    drawLine(canvas, { x: x1, y: y1 }, { x: x2, y: y2 }, 1.1)
}

// --- the sheet ------------------------------------------------------------

export interface GameTruth {
    matchId: number
    team: "home" | "away"
    game: 1 | 2 | 3
    /** null means both digit boxes were left blank. */
    score: number | null
    win: boolean
}

export interface SyntheticSheet {
    image: RasterImage
    geometry: SheetGeometry
    scale: number
    truth: {
        tag: string
        matchCount: number
        eventType: SheetEventType
        games: GameTruth[]
    }
}

export function fakeCourtSheet(
    matchCount: number,
    court = 4,
    matchIds?: readonly number[]
): CourtSheet {
    const matches: SheetMatch[] = []
    for (let i = 0; i < matchCount; i++) {
        matches.push({
            matchId: matchIds?.[i] ?? 900 + i,
            orderOnCourt: i + 1,
            divisionName: "AA",
            time: "19:00:00",
            playoff: false,
            playoffMatchNum: null,
            bracket: null,
            home: {
                teamId: 1,
                name: "Home",
                isPlaceholder: false,
                captains: []
            },
            away: {
                teamId: 2,
                name: "Away",
                isPlaceholder: false,
                captains: []
            },
            referee: null,
            backupReferee: null,
            workTeam: null
        })
    }
    return { court, matches }
}

export interface SynthesizeOptions {
    matchCount: 1 | 2 | 3 | 4
    eventType: SheetEventType
    /** Pixels per point. 1.62 is the old 1280px upload, 3.79 the new 3000px. */
    scale: number
    court?: number
    date?: string
    seasonCode?: string
    ordinal?: number
    /**
     * Real match ids, when the sheet has to line up with rows in a database.
     * Defaults to a private 900-series so pure tests need not invent any.
     */
    matchIds?: readonly number[]
    /** Score per (matchId, team, game); missing entries are left blank. */
    scores?: GameTruth[]
    jitter?: number
}

export async function synthesizeSheet(
    opts: SynthesizeOptions
): Promise<SyntheticSheet> {
    const court = opts.court ?? 4
    const sheet = fakeCourtSheet(opts.matchCount, court, opts.matchIds)
    const geometry = buildSheetGeometry(sheet, opts.eventType)
    const canvas = createCanvas(opts.scale)

    const night = {
        seasonCode: opts.seasonCode ?? "F26",
        eventType: opts.eventType,
        ordinal: opts.ordinal ?? 3,
        date: opts.date ?? "2026-10-05"
    }
    const tag = sheetTag(night, court)

    // Registration marks
    for (const fiducial of geometry.fiducials) fillRect(canvas, fiducial)

    // The real tag QR, from the same encoder the renderer uses
    const qr = QRCode.create(tag, { errorCorrectionLevel: "M" })
    const size = qr.modules.size
    const moduleSize = geometry.tagQr.w / size
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (!qr.modules.data[r * size + c]) continue
            fillRect(canvas, {
                x: geometry.tagQr.x + c * moduleSize,
                y: geometry.tagQr.y + geometry.tagQr.h - (r + 1) * moduleSize,
                w: moduleSize,
                h: moduleSize
            })
        }
    }

    // Printed furniture the reader snaps to
    strokeRect(canvas, geometry.refNotes, 0.8)
    for (const block of geometry.blocks) {
        drawLine(
            canvas,
            { x: block.x, y: block.headerY },
            { x: block.x + block.w, y: block.headerY },
            0.6
        )
    }

    const truth: GameTruth[] = []
    const wanted = new Map(
        (opts.scores ?? []).map((s) => [`${s.matchId}:${s.team}:${s.game}`, s])
    )

    for (const game of geometry.games) {
        const key = `${game.matchId}:${game.team}:${game.game}`
        const want = wanted.get(key)
        const score = want?.score ?? null
        const win = want?.win ?? false

        for (const box of game.finalDigits) strokeRect(canvas, box, 1.1)
        strokeRect(canvas, game.win, 0.9)
        for (const box of game.timeouts) strokeRect(canvas, box, 0.7)

        if (score !== null) {
            const tens = Math.floor(score / 10)
            const ones = score % 10
            if (tens > 0)
                drawDigit(canvas, tens, game.finalDigits[0], opts.jitter)
            drawDigit(canvas, ones, game.finalDigits[1], opts.jitter)
        }
        if (win) drawTick(canvas, game.win)

        truth.push({
            matchId: game.matchId,
            team: game.team,
            game: game.game,
            score,
            win
        })
    }

    return {
        image: toImage(canvas),
        geometry,
        scale: opts.scale,
        truth: {
            tag,
            matchCount: opts.matchCount,
            eventType: opts.eventType,
            games: truth
        }
    }
}
