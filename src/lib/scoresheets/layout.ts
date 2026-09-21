/**
 * layout.ts — every rectangle on a score sheet, in PDF points.
 *
 * This module is the single source of truth for the printed geometry. The
 * renderer draws from it today. A future pipeline that reads photographed
 * sheets should import it too, rather than re-deriving coordinates: the four
 * corner fiducials give a photo a coordinate system, and the boxes below are
 * expressed in that same system, so the two can never drift apart.
 *
 * Coordinates follow pdf-lib: origin bottom-left, y increases upward, and a
 * rect's `y` is its BOTTOM edge.
 */

import { gameRules, tallyRowCount, TEMPLATE_VERSION } from "./sheet-config"
import type { CourtSheet, SheetEventType } from "./types"

export interface BoxRect {
    x: number
    y: number
    w: number
    h: number
}

// --- page frame -----------------------------------------------------------

export const PAGE_WIDTH = 612
export const PAGE_HEIGHT = 792

/** Fiducials sit in this band, outside the content area. */
const FIDUCIAL_INSET = 14
const FIDUCIAL_SIZE = 12

const CONTENT_MARGIN = 34
const CONTENT_LEFT = CONTENT_MARGIN
const CONTENT_RIGHT = PAGE_WIDTH - CONTENT_MARGIN
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT
const CONTENT_TOP = PAGE_HEIGHT - CONTENT_MARGIN

const HEADER_HEIGHT = 92
const RULES_HEIGHT = 52
/** Strip carrying the GAME 1/2/3 column headings, printed once per page. */
const GAME_HEADING_HEIGHT = 11
const QR_SIZE = 64

/** Ref-notes box and the footer line, measured up from the bottom margin. */
const FOOTER_TEXT_HEIGHT = 14
const REF_NOTES_HEIGHT = 56

// --- match blocks ---------------------------------------------------------

const MATCH_HEADER_HEIGHT = 13
const MATCH_FOOTER_HEIGHT = 12
const BLOCK_INNER_PAD = 4
/** A single match should not balloon to fill the whole page. */
const MAX_BLOCK_HEIGHT = 150

const LABEL_COLUMN_WIDTH = 150
const GAME_GAP = 6

/** The row holding timeouts, the FINAL digit boxes and the forfeit tick. */
const FINAL_LINE_HEIGHT = 16
const DIGIT_BOX = 13
const CHECK_BOX = 7.5
const INITIALS_BOX_W = 13
const INITIALS_BOX_H = 10

export interface TallyGeometry extends BoxRect {
    rows: number
    perRow: number
    rowHeight: number
    cellWidth: number
    maxPoint: number
    /** Leading points printed with an X through them. */
    preStruck: number
}

export interface GameGeometry {
    matchId: number
    team: "home" | "away"
    game: 1 | 2 | 3
    /** Tens then ones. The only fields a reader must interpret. */
    finalDigits: [BoxRect, BoxRect]
    timeouts: [BoxRect, BoxRect]
    forfeit: BoxRect
    tally: TallyGeometry
}

export interface TeamRowGeometry {
    team: "home" | "away"
    /** Bottom edge and height of the whole row. */
    y: number
    h: number
}

export interface GameColumn {
    game: 1 | 2 | 3
    x: number
    w: number
}

export interface BlockGeometry {
    matchId: number
    orderOnCourt: number
    /** Whole block. */
    x: number
    y: number
    w: number
    h: number
    /** Bottom edge of the match header strip. */
    headerY: number
    headerH: number
    rows: [TeamRowGeometry, TeamRowGeometry]
    footerY: number
    footerH: number
    labelColumn: { x: number; w: number }
    gameColumns: [GameColumn, GameColumn, GameColumn]
}

export interface SheetGeometry {
    templateVersion: number
    page: { width: number; height: number }
    /** Top-left, top-right, bottom-left, then the half-size bottom-right. */
    fiducials: BoxRect[]
    qr: BoxRect
    content: { left: number; right: number; top: number; width: number }
    header: { y: number; h: number }
    rules: { y: number; h: number }
    /** Column headings shared by every block, since the columns never move. */
    gameHeadings: { y: number; h: number; columns: GameColumn[] }
    refNotes: BoxRect
    footerTextY: number
    blocks: BlockGeometry[]
    games: GameGeometry[]
    captainInitials: {
        matchId: number
        team: "home" | "away"
        box: BoxRect
    }[]
}

/**
 * Three full-size corner squares and one half-size square at bottom-right.
 * The asymmetry makes a photo's orientation unambiguous.
 */
export function buildFiducials(): BoxRect[] {
    const s = FIDUCIAL_SIZE
    const i = FIDUCIAL_INSET
    return [
        { x: i, y: PAGE_HEIGHT - i - s, w: s, h: s },
        { x: PAGE_WIDTH - i - s, y: PAGE_HEIGHT - i - s, w: s, h: s },
        { x: i, y: i, w: s, h: s },
        { x: PAGE_WIDTH - i - s / 2, y: i, w: s / 2, h: s / 2 }
    ]
}

function buildGameCells(
    matchId: number,
    team: "home" | "away",
    row: TeamRowGeometry,
    columns: [GameColumn, GameColumn, GameColumn],
    eventType: SheetEventType
): GameGeometry[] {
    const rules = gameRules(eventType)
    const rowTop = row.y + row.h

    return columns.map((column, index) => {
        const rule = rules[index]
        const rows = tallyRowCount(rule)

        const tallyTop = rowTop - 1
        const tallyHeight = row.h - FINAL_LINE_HEIGHT - 2
        const tallyBottom = tallyTop - tallyHeight

        const finalTop = tallyBottom - 1
        const finalBottom = finalTop - FINAL_LINE_HEIGHT
        const digitY = finalBottom + (FINAL_LINE_HEIGHT - DIGIT_BOX) / 2
        const checkY = finalBottom + (FINAL_LINE_HEIGHT - CHECK_BOX) / 2

        // Left to right across the row: T.O. [][]  FINAL [][]  FFT []
        const x = column.x
        const timeout1X = x + 15
        const timeout2X = timeout1X + CHECK_BOX + 1.5
        const digit1X = x + 59.5
        const digit2X = digit1X + DIGIT_BOX + 2
        const forfeitX = digit2X + DIGIT_BOX + 17.5

        return {
            matchId,
            team,
            game: rule.game,
            finalDigits: [
                { x: digit1X, y: digitY, w: DIGIT_BOX, h: DIGIT_BOX },
                { x: digit2X, y: digitY, w: DIGIT_BOX, h: DIGIT_BOX }
            ] as [BoxRect, BoxRect],
            timeouts: [
                { x: timeout1X, y: checkY, w: CHECK_BOX, h: CHECK_BOX },
                { x: timeout2X, y: checkY, w: CHECK_BOX, h: CHECK_BOX }
            ] as [BoxRect, BoxRect],
            forfeit: { x: forfeitX, y: checkY, w: CHECK_BOX, h: CHECK_BOX },
            tally: {
                x: column.x,
                y: tallyBottom,
                w: column.w,
                h: tallyHeight,
                rows,
                perRow: rule.perRow,
                rowHeight: tallyHeight / rows,
                cellWidth: column.w / rule.perRow,
                maxPoint: rule.maxPoint,
                preStruck: rule.preStruck
            }
        }
    })
}

/**
 * Lay out one court's page. `sheet.matches` is 1-4 long in practice; the
 * blocks are distributed evenly down the available band so a two-match night
 * is not crammed at the top.
 */
export function buildSheetGeometry(
    sheet: CourtSheet,
    eventType: SheetEventType
): SheetGeometry {
    const headerY = CONTENT_TOP - HEADER_HEIGHT
    const rulesY = headerY - RULES_HEIGHT

    const refNotesY = CONTENT_MARGIN + FOOTER_TEXT_HEIGHT
    const refNotes: BoxRect = {
        x: CONTENT_LEFT,
        y: refNotesY,
        w: CONTENT_WIDTH,
        h: REF_NOTES_HEIGHT
    }

    const headingsY = rulesY - GAME_HEADING_HEIGHT
    const blocksTop = headingsY
    const blocksBottom = refNotesY + REF_NOTES_HEIGHT + 8
    const available = blocksTop - blocksBottom

    const count = Math.max(sheet.matches.length, 1)
    const slotHeight = available / count
    const blockHeight = Math.min(slotHeight, MAX_BLOCK_HEIGHT)

    const gameAreaX = CONTENT_LEFT + LABEL_COLUMN_WIDTH
    const gameWidth = (CONTENT_WIDTH - LABEL_COLUMN_WIDTH - GAME_GAP * 2) / 3

    // Columns are identical on every block, so the headings can be shared.
    const sharedColumns = [1, 2, 3].map((game, index) => ({
        game: game as 1 | 2 | 3,
        x: gameAreaX + index * (gameWidth + GAME_GAP),
        w: gameWidth
    })) as [GameColumn, GameColumn, GameColumn]

    const blocks: BlockGeometry[] = []
    const games: GameGeometry[] = []
    const captainInitials: SheetGeometry["captainInitials"] = []

    sheet.matches.forEach((match, index) => {
        const blockTop = blocksTop - index * slotHeight
        const blockBottom = blockTop - blockHeight

        const headerBottom = blockTop - MATCH_HEADER_HEIGHT
        const teamRowHeight =
            (blockHeight -
                MATCH_HEADER_HEIGHT -
                MATCH_FOOTER_HEIGHT -
                BLOCK_INNER_PAD) /
            2

        const homeTop = headerBottom - 1
        const homeBottom = homeTop - teamRowHeight
        const awayBottom = homeBottom - teamRowHeight
        const footerTop = awayBottom - 1
        const footerBottom = footerTop - MATCH_FOOTER_HEIGHT

        const gameColumns = sharedColumns

        const rows: [TeamRowGeometry, TeamRowGeometry] = [
            { team: "home", y: homeBottom, h: teamRowHeight },
            { team: "away", y: awayBottom, h: teamRowHeight }
        ]

        blocks.push({
            matchId: match.matchId,
            orderOnCourt: match.orderOnCourt,
            x: CONTENT_LEFT,
            y: blockBottom,
            w: CONTENT_WIDTH,
            h: blockHeight,
            headerY: headerBottom,
            headerH: MATCH_HEADER_HEIGHT,
            rows,
            footerY: footerBottom,
            footerH: MATCH_FOOTER_HEIGHT,
            labelColumn: { x: CONTENT_LEFT, w: LABEL_COLUMN_WIDTH },
            gameColumns
        })

        for (const row of rows) {
            games.push(
                ...buildGameCells(
                    match.matchId,
                    row.team,
                    row,
                    gameColumns,
                    eventType
                )
            )
        }

        const initialsY =
            footerBottom + (MATCH_FOOTER_HEIGHT - INITIALS_BOX_H) / 2
        captainInitials.push(
            {
                matchId: match.matchId,
                team: "home",
                box: {
                    x: CONTENT_LEFT + 62,
                    y: initialsY,
                    w: INITIALS_BOX_W,
                    h: INITIALS_BOX_H
                }
            },
            {
                matchId: match.matchId,
                team: "away",
                box: {
                    x: CONTENT_LEFT + 79,
                    y: initialsY,
                    w: INITIALS_BOX_W,
                    h: INITIALS_BOX_H
                }
            }
        )
    })

    return {
        templateVersion: TEMPLATE_VERSION,
        page: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        fiducials: buildFiducials(),
        qr: {
            x: CONTENT_RIGHT - QR_SIZE,
            y: CONTENT_TOP - QR_SIZE,
            w: QR_SIZE,
            h: QR_SIZE
        },
        content: {
            left: CONTENT_LEFT,
            right: CONTENT_RIGHT,
            top: CONTENT_TOP,
            width: CONTENT_WIDTH
        },
        header: { y: headerY, h: HEADER_HEIGHT },
        rules: { y: rulesY, h: RULES_HEIGHT },
        gameHeadings: {
            y: headingsY,
            h: GAME_HEADING_HEIGHT,
            columns: sharedColumns
        },
        refNotes,
        footerTextY: CONTENT_MARGIN,
        blocks,
        games,
        captainInitials
    }
}
