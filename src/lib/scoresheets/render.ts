/**
 * render.ts — draw a night's score sheets with pdf-lib, one page per court.
 *
 * Every rectangle comes from `buildSheetGeometry()`. Nothing here invents a
 * coordinate, so the printed page and the exported template stay identical.
 */

import {
    PDFDocument,
    type PDFFont,
    type PDFPage,
    rgb,
    StandardFonts
} from "pdf-lib"
import QRCode from "qrcode"

import { site } from "@/config/site"

import { fitTextToCell, truncateToFit } from "@/lib/pdf/tryout-sheet-shared"
import { formatMatchTime } from "@/lib/date-utils"

import {
    type BoxRect,
    type BlockGeometry,
    buildSheetGeometry,
    type GameGeometry,
    PAGE_HEIGHT,
    PAGE_WIDTH,
    type SheetGeometry
} from "./layout"
import {
    FILL_INSTRUCTION,
    ruleLines,
    sheetCode,
    sheetDeepLink
} from "./sheet-config"
import type { CourtSheet, SheetMatch, SheetNight, SheetTeam } from "./types"

const BLACK = rgb(0, 0, 0)
const GREY = rgb(0.45, 0.45, 0.45)
const LIGHT = rgb(0.72, 0.72, 0.72)
const ACCENT = rgb(0.44, 0.2, 0.95)
const STRUCK = rgb(0.6, 0.6, 0.6)

interface Fonts {
    regular: PDFFont
    bold: PDFFont
}

function drawBox(
    page: PDFPage,
    box: BoxRect,
    borderWidth: number,
    borderColor = BLACK
) {
    page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        borderWidth,
        borderColor
    })
}

function drawUnderline(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    color = LIGHT
) {
    page.drawLine({
        start: { x, y },
        end: { x: x + width, y },
        thickness: 0.6,
        color
    })
}

// --- page furniture -------------------------------------------------------

function drawFiducials(page: PDFPage, geometry: SheetGeometry) {
    for (const fiducial of geometry.fiducials) {
        page.drawRectangle({
            x: fiducial.x,
            y: fiducial.y,
            width: fiducial.w,
            height: fiducial.h,
            color: BLACK
        })
    }
}

async function drawHeader(
    page: PDFPage,
    doc: PDFDocument,
    geometry: SheetGeometry,
    night: SheetNight,
    court: number | null,
    fonts: Fonts
) {
    const { content } = geometry
    const top = content.top

    page.drawText("BSD Volleyball", {
        x: content.left,
        y: top - 15,
        size: 16,
        font: fonts.bold,
        color: BLACK
    })

    page.drawText(`${night.seasonLabel}  •  ${night.nightLabel}`, {
        x: content.left,
        y: top - 28,
        size: 9,
        font: fonts.regular,
        color: GREY
    })

    const courtLabel = court === null ? "COURT TBD" : `COURT ${court}`
    page.drawText(courtLabel, {
        x: content.left,
        y: top - 62,
        size: 28,
        font: fonts.bold,
        color: ACCENT
    })

    const code = sheetCode(night, court)
    const link = sheetDeepLink(site.url, night.date, court)
    const qrPng = await QRCode.toBuffer(link, {
        errorCorrectionLevel: "M",
        margin: 0,
        width: 256
    })
    const qrImage = await doc.embedPng(qrPng)
    page.drawImage(qrImage, {
        x: geometry.qr.x,
        y: geometry.qr.y,
        width: geometry.qr.w,
        height: geometry.qr.h
    })

    const codeWidth = fonts.bold.widthOfTextAtSize(code, 7.5)
    page.drawText(code, {
        x: geometry.qr.x + (geometry.qr.w - codeWidth) / 2,
        y: geometry.qr.y - 9,
        size: 7.5,
        font: fonts.bold,
        color: BLACK
    })

    const scanLabel = "Scan to enter scores"
    const scanWidth = fonts.regular.widthOfTextAtSize(scanLabel, 6)
    page.drawText(scanLabel, {
        x: geometry.qr.x + (geometry.qr.w - scanWidth) / 2,
        y: geometry.qr.y - 17,
        size: 6,
        font: fonts.regular,
        color: GREY
    })
}

function drawRules(
    page: PDFPage,
    geometry: SheetGeometry,
    night: SheetNight,
    fonts: Fonts
) {
    const lines = ruleLines(night.eventType)
    let y = geometry.rules.y + geometry.rules.h - 8

    page.drawText(FILL_INSTRUCTION, {
        x: geometry.content.left,
        y,
        size: 7.5,
        font: fonts.bold,
        color: BLACK
    })
    y -= 9

    for (const line of lines) {
        page.drawText(`• ${line}`, {
            x: geometry.content.left,
            y,
            size: 7,
            font: fonts.regular,
            color: GREY
        })
        y -= 8
    }
}

function drawFooter(page: PDFPage, geometry: SheetGeometry, fonts: Fonts) {
    const notes = geometry.refNotes
    drawBox(page, notes, 0.8, LIGHT)

    page.drawText("REF NOTES", {
        x: notes.x + 6,
        y: notes.y + notes.h - 11,
        size: 8,
        font: fonts.bold,
        color: BLACK
    })
    page.drawText("(misconduct sanctions, official timeouts, injuries, etc)", {
        x: notes.x + 62,
        y: notes.y + notes.h - 11,
        size: 7,
        font: fonts.regular,
        color: GREY
    })

    const footer =
        "The captains are responsible for confirming all scores at game time!"
    const width = fonts.bold.widthOfTextAtSize(footer, 8)
    page.drawText(footer, {
        x: (PAGE_WIDTH - width) / 2,
        y: geometry.footerTextY,
        size: 8,
        font: fonts.bold,
        color: BLACK
    })
}

// --- match blocks ---------------------------------------------------------

function matchHeadline(match: SheetMatch): string {
    const base = `MATCH #${match.orderOnCourt}`
    if (match.playoff && match.playoffMatchNum !== null) {
        return `${base}  (M${match.playoffMatchNum})`
    }
    return base
}

function drawMatchHeader(
    page: PDFPage,
    block: BlockGeometry,
    match: SheetMatch,
    fonts: Fonts
) {
    const y = block.headerY + 3

    page.drawText(matchHeadline(match), {
        x: block.x,
        y,
        size: 10,
        font: fonts.bold,
        color: BLACK
    })

    page.drawText(match.divisionName, {
        x: block.x + 78,
        y,
        size: 9,
        font: fonts.bold,
        color: ACCENT
    })

    const time = match.time ? formatMatchTime(match.time) : "time TBD"
    page.drawText(time, {
        x: block.x + 112,
        y,
        size: 9,
        font: fonts.regular,
        color: BLACK
    })

    // Referee, then the work team on playoff sheets
    const refX = block.x + 168
    page.drawText("REF:", {
        x: refX,
        y,
        size: 8,
        font: fonts.bold,
        color: GREY
    })
    const refName = match.referee ?? ""
    page.drawText(
        truncateToFit({
            text: refName,
            maxWidth: 104,
            fontSize: 9,
            font: fonts.regular
        }),
        { x: refX + 22, y, size: 9, font: fonts.regular, color: BLACK }
    )
    if (!refName) {
        drawUnderline(page, refX + 22, y - 2, 104)
    }

    let tailX = refX + 134
    if (match.backupReferee) {
        page.drawText(`backup: ${match.backupReferee}`, {
            x: tailX,
            y,
            size: 7,
            font: fonts.regular,
            color: GREY
        })
        tailX += 96
    }
    if (match.workTeam) {
        page.drawText(
            truncateToFit({
                text: `WORK: ${match.workTeam}`,
                maxWidth: block.x + block.w - tailX - 34,
                fontSize: 8,
                font: fonts.bold
            }),
            { x: tailX, y, size: 8, font: fonts.bold, color: BLACK }
        )
    }

    // Tiny machine id, right-aligned: a redundant cross-check for a reader
    // that has already identified the sheet from its QR code.
    const idLabel = `#${match.matchId}`
    const idWidth = fonts.regular.widthOfTextAtSize(idLabel, 6)
    page.drawText(idLabel, {
        x: block.x + block.w - idWidth,
        y,
        size: 6,
        font: fonts.regular,
        color: LIGHT
    })

    drawUnderline(page, block.x, block.headerY, block.w, GREY)
}

function drawTeamLabel(
    page: PDFPage,
    block: BlockGeometry,
    team: SheetTeam,
    rowY: number,
    rowH: number,
    fonts: Fonts
) {
    const maxWidth = block.labelColumn.w - 8
    const nameTop = rowY + rowH - 11

    const fitted = fitTextToCell({
        text: team.name,
        maxWidth,
        baseFontSize: 10,
        minFontSize: 6.5,
        font: fonts.bold
    })
    page.drawText(fitted.text, {
        x: block.labelColumn.x,
        y: nameTop,
        size: fitted.fontSize,
        font: fonts.bold,
        color: team.isPlaceholder ? GREY : BLACK
    })

    if (team.captains.length > 0) {
        page.drawText(
            truncateToFit({
                text: `C: ${team.captains.join(", ")}`,
                maxWidth,
                fontSize: 7,
                font: fonts.regular
            }),
            {
                x: block.labelColumn.x,
                y: nameTop - 9,
                size: 7,
                font: fonts.regular,
                color: GREY
            }
        )
    }
}

function drawGameCell(page: PDFPage, game: GameGeometry, fonts: Fonts) {
    const { tally } = game

    // Running tally: the ref slashes each point as it is scored.
    for (let point = 1; point <= tally.maxPoint; point++) {
        const index = point - 1
        const row = Math.floor(index / tally.perRow)
        const column = index % tally.perRow
        const cx = tally.x + column * tally.cellWidth
        const cy = tally.y + tally.h - (row + 1) * tally.rowHeight

        const label = String(point)
        const struck = point <= tally.preStruck
        const size = 6.5
        const textWidth = fonts.regular.widthOfTextAtSize(label, size)
        const textX = cx + (tally.cellWidth - textWidth) / 2
        const textY = cy + (tally.rowHeight - size) / 2 + 0.5

        page.drawText(label, {
            x: textX,
            y: textY,
            size,
            font: fonts.regular,
            color: struck ? STRUCK : BLACK
        })

        // Playoff games start at 4-4, so those points arrive pre-marked.
        if (struck) {
            page.drawLine({
                start: { x: cx + 1.5, y: cy + 1 },
                end: {
                    x: cx + tally.cellWidth - 1.5,
                    y: cy + tally.rowHeight - 1
                },
                thickness: 0.7,
                color: STRUCK
            })
        }
    }

    const boxBaseline = game.timeouts[0].y + 1.5

    page.drawText("T.O.", {
        x: game.tally.x,
        y: boxBaseline,
        size: 6,
        font: fonts.regular,
        color: GREY
    })
    for (const timeout of game.timeouts) {
        drawBox(page, timeout, 0.7, GREY)
    }

    page.drawText("FINAL", {
        x: game.finalDigits[0].x - 23,
        y: game.finalDigits[0].y + 4,
        size: 6.5,
        font: fonts.bold,
        color: BLACK
    })
    // The only fields a future reader has to interpret: heavy border, empty.
    for (const digit of game.finalDigits) {
        drawBox(page, digit, 1.1, BLACK)
    }

    page.drawText("FFT", {
        x: game.forfeit.x - 13,
        y: boxBaseline,
        size: 6,
        font: fonts.regular,
        color: GREY
    })
    drawBox(page, game.forfeit, 0.7, GREY)
}

function drawBlockFooter(
    page: PDFPage,
    geometry: SheetGeometry,
    block: BlockGeometry,
    fonts: Fonts
) {
    const y = block.footerY + 3

    page.drawText("Captains confirm:", {
        x: block.labelColumn.x,
        y,
        size: 6.5,
        font: fonts.regular,
        color: GREY
    })
    for (const initials of geometry.captainInitials) {
        if (initials.matchId !== block.matchId) continue
        drawBox(page, initials.box, 0.7, GREY)
    }

    for (const column of block.gameColumns) {
        page.drawText("start:", {
            x: column.x,
            y,
            size: 6.5,
            font: fonts.regular,
            color: GREY
        })
        drawUnderline(page, column.x + 19, block.footerY + 2, 34)

        page.drawText("end:", {
            x: column.x + 58,
            y,
            size: 6.5,
            font: fonts.regular,
            color: GREY
        })
        drawUnderline(page, column.x + 74, block.footerY + 2, 34)
    }
}

/**
 * Printed once per page rather than per block: the match header needs the
 * full page width for the referee and work-team text, and the game columns
 * are in the same place on every block anyway.
 */
function drawGameHeadings(
    page: PDFPage,
    geometry: SheetGeometry,
    fonts: Fonts
) {
    const { gameHeadings } = geometry
    for (const column of gameHeadings.columns) {
        const label = `GAME ${column.game}`
        const width = fonts.bold.widthOfTextAtSize(label, 8)
        page.drawText(label, {
            x: column.x + (column.w - width) / 2,
            y: gameHeadings.y + 2,
            size: 8,
            font: fonts.bold,
            color: BLACK
        })
    }
}

// --- page assembly --------------------------------------------------------

async function drawCourtPage(
    doc: PDFDocument,
    night: SheetNight,
    sheet: CourtSheet,
    fonts: Fonts
) {
    const geometry = buildSheetGeometry(sheet, night.eventType)
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

    drawFiducials(page, geometry)
    await drawHeader(page, doc, geometry, night, sheet.court, fonts)
    drawRules(page, geometry, night, fonts)
    drawGameHeadings(page, geometry, fonts)

    geometry.blocks.forEach((block, index) => {
        const match = sheet.matches[index]
        if (!match) return

        drawMatchHeader(page, block, match, fonts)

        drawTeamLabel(
            page,
            block,
            match.home,
            block.rows[0].y,
            block.rows[0].h,
            fonts
        )
        drawTeamLabel(
            page,
            block,
            match.away,
            block.rows[1].y,
            block.rows[1].h,
            fonts
        )

        for (const game of geometry.games) {
            if (game.matchId !== block.matchId) continue
            drawGameCell(page, game, fonts)
        }

        drawBlockFooter(page, geometry, block, fonts)
    })

    drawFooter(page, geometry, fonts)
}

export async function renderScoreSheetsPdf(
    night: SheetNight
): Promise<Uint8Array> {
    const doc = await PDFDocument.create()
    doc.setTitle(`BSD score sheets — ${night.date}`)

    const fonts: Fonts = {
        regular: await doc.embedFont(StandardFonts.Helvetica),
        bold: await doc.embedFont(StandardFonts.HelveticaBold)
    }

    for (const sheet of night.courts) {
        await drawCourtPage(doc, night, sheet, fonts)
    }

    return doc.save()
}
