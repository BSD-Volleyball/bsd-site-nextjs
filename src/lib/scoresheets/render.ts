/**
 * render.ts — draw a night's score sheets with pdf-lib, one page per court.
 *
 * Every rectangle comes from `buildSheetGeometry()`. Nothing here invents a
 * coordinate, so the printed page and the exported template stay identical.
 */

import {
    PDFDocument,
    type PDFFont,
    type PDFImage,
    type PDFPage,
    rgb,
    StandardFonts
} from "pdf-lib"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import QRCode from "qrcode"

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
    SCORE_ENTRY_SHORT_URL,
    sheetCode,
    sheetTag,
    startNote
} from "./sheet-config"
import type { CourtSheet, SheetMatch, SheetNight, SheetTeam } from "./types"

const BLACK = rgb(0, 0, 0)
const GREY = rgb(0.45, 0.45, 0.45)
const LIGHT = rgb(0.72, 0.72, 0.72)
const ACCENT = rgb(0.44, 0.2, 0.95)
const STRUCK = rgb(0.6, 0.6, 0.6)
const NOTE_BG = rgb(0.99, 0.91, 0.91)
const NOTE_FG = rgb(0.6, 0.11, 0.11)

/**
 * The stylized link QR is a fixed asset, read once per process and embedded
 * once per document, so a six-court night carries the image bytes once.
 */
let linkQrPngCache: Buffer | null = null
function linkQrPng(): Buffer {
    linkQrPngCache ??= readFileSync(
        join(process.cwd(), "public", "score-sheet-qr.png")
    )
    return linkQrPngCache
}

interface Fonts {
    regular: PDFFont
    bold: PDFFont
}

interface EmbeddedImages {
    linkQr: PDFImage
    tagQr: PDFImage
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
    geometry: SheetGeometry,
    night: SheetNight,
    court: number | null,
    images: EmbeddedImages,
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

    const centred = (
        text: string,
        box: BoxRect,
        y: number,
        size: number,
        font: PDFFont,
        color = GREY
    ) => {
        const width = font.widthOfTextAtSize(text, size)
        page.drawText(text, {
            x: box.x + (box.w - width) / 2,
            y,
            size,
            font,
            color
        })
    }

    // Stylized link QR — the same on every sheet, so whoever collects the
    // night's paperwork lands on one page and works through the lot.
    page.drawImage(images.linkQr, {
        x: geometry.qr.x,
        y: geometry.qr.y,
        width: geometry.qr.w,
        height: geometry.qr.h
    })
    centred(
        "Scan to enter scores",
        geometry.qr,
        geometry.qr.y - 8,
        6,
        fonts.regular
    )
    centred(
        SCORE_ENTRY_SHORT_URL,
        geometry.qr,
        geometry.qr.y - 16,
        6,
        fonts.regular,
        LIGHT
    )

    // Machine tag — what tells a processor which sheet a photo is, now that
    // the visible QR says the same thing on every page.
    page.drawImage(images.tagQr, {
        x: geometry.tagQr.x,
        y: geometry.tagQr.y,
        width: geometry.tagQr.w,
        height: geometry.tagQr.h
    })
    centred(
        sheetCode(night, court),
        geometry.tagQr,
        geometry.tagQr.y - 9,
        8,
        fonts.bold,
        BLACK
    )
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
    previous: SheetMatch | null,
    fonts: Fonts
) {
    const y = block.headerY + 3
    const rightEdge = block.x + block.w

    // Right side first: the machine id and the highlighted start-time note
    // claim their space, and everything else is fitted into what is left.
    const idLabel = `#${match.matchId}`
    const idWidth = fonts.regular.widthOfTextAtSize(idLabel, 6)
    page.drawText(idLabel, {
        x: rightEdge - idWidth,
        y,
        size: 6,
        font: fonts.regular,
        color: LIGHT
    })

    let middleEdge = rightEdge - idWidth - 8

    const note = startNote(match, previous)
    if (note) {
        const noteSize = 6.5
        const noteWidth = fonts.bold.widthOfTextAtSize(note, noteSize)
        const padding = 5
        const boxW = noteWidth + padding * 2
        const boxX = middleEdge - boxW
        page.drawRectangle({
            x: boxX,
            y: block.headerY + 0.5,
            width: boxW,
            height: block.headerH - 1,
            color: NOTE_BG
        })
        page.drawText(note, {
            x: boxX + padding,
            y,
            size: noteSize,
            font: fonts.bold,
            color: NOTE_FG
        })
        middleEdge = boxX - 8
    }

    // Left side, in a running cursor so nothing can overlap the note.
    let x = block.x
    page.drawText(matchHeadline(match), {
        x,
        y,
        size: 10,
        font: fonts.bold,
        color: BLACK
    })
    x += fonts.bold.widthOfTextAtSize(matchHeadline(match), 10) + 8

    page.drawText(match.divisionName, {
        x,
        y,
        size: 9,
        font: fonts.bold,
        color: ACCENT
    })
    x += fonts.bold.widthOfTextAtSize(match.divisionName, 9) + 8

    const time = match.time ? formatMatchTime(match.time) : "time TBD"
    page.drawText(time, { x, y, size: 9, font: fonts.regular, color: BLACK })
    x += fonts.regular.widthOfTextAtSize(time, 9) + 10

    page.drawText("REF:", { x, y, size: 8, font: fonts.bold, color: GREY })
    x += fonts.bold.widthOfTextAtSize("REF:", 8) + 4

    // Whatever the note and id left over, shared by ref / backup / work.
    const remaining = Math.max(middleEdge - x, 0)
    const refWidth = Math.min(remaining, 100)
    const refName = match.referee ?? ""
    if (refName) {
        page.drawText(
            truncateToFit({
                text: refName,
                maxWidth: refWidth,
                fontSize: 9,
                font: fonts.regular
            }),
            { x, y, size: 9, font: fonts.regular, color: BLACK }
        )
    } else if (refWidth > 20) {
        drawUnderline(page, x, y - 2, refWidth)
    }
    x += refWidth + 8

    // The work team outranks the backup referee for the remaining space: on a
    // playoff night four people have to know they are working this match,
    // whereas the backup is a name the primary already knows. Reserve the
    // work team's width first so it can never be squeezed to an ellipsis.
    let backupEdge = middleEdge
    if (match.workTeam) {
        const label = `WORK: ${match.workTeam}`
        const width = fonts.bold.widthOfTextAtSize(label, 8)
        if (middleEdge - x >= width) {
            page.drawText(label, {
                x: middleEdge - width,
                y,
                size: 8,
                font: fonts.bold,
                color: BLACK
            })
            backupEdge = middleEdge - width - 8
        } else if (middleEdge - x > 60) {
            page.drawText(
                truncateToFit({
                    text: label,
                    maxWidth: middleEdge - x,
                    fontSize: 8,
                    font: fonts.bold
                }),
                { x, y, size: 8, font: fonts.bold, color: BLACK }
            )
            backupEdge = x
        }
    }

    if (match.backupReferee && backupEdge - x > 46) {
        page.drawText(
            truncateToFit({
                text: `backup: ${match.backupReferee}`,
                maxWidth: Math.min(backupEdge - x, 92),
                fontSize: 7,
                font: fonts.regular
            }),
            { x, y, size: 7, font: fonts.regular, color: GREY }
        )
    }

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
    images: EmbeddedImages,
    fonts: Fonts
) {
    const geometry = buildSheetGeometry(sheet, night.eventType)
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

    drawFiducials(page, geometry)
    await drawHeader(page, geometry, night, sheet.court, images, fonts)
    drawRules(page, geometry, night, fonts)
    drawGameHeadings(page, geometry, fonts)

    geometry.blocks.forEach((block, index) => {
        const match = sheet.matches[index]
        if (!match) return

        drawMatchHeader(
            page,
            block,
            match,
            sheet.matches[index - 1] ?? null,
            fonts
        )

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

    // The link QR is identical on every page, so it is embedded once and
    // drawn many times; only the machine tag differs per court.
    const linkQr = await doc.embedPng(linkQrPng())

    for (const sheet of night.courts) {
        const tagPng = await QRCode.toBuffer(sheetTag(night, sheet.court), {
            errorCorrectionLevel: "M",
            margin: 0,
            width: 320
        })
        const tagQr = await doc.embedPng(tagPng)
        await drawCourtPage(doc, night, sheet, { linkQr, tagQr }, fonts)
    }

    return doc.save()
}
