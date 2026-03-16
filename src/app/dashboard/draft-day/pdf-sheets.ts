"use client"

import {
    PDFDocument,
    StandardFonts,
    rgb,
    type PDFFont,
    type PDFPage
} from "pdf-lib"
import type {
    DraftSheetPayload,
    DivisionSheetData,
    TeamSheetData
} from "./actions"

// Page dimensions: landscape 8.5x11 inches at 72 dpi
const PAGE_W = 792
const PAGE_H = 612

const MARGIN = 42
const CELL_GAP = 8

// Color palette — derived from site primary oklch(0.5393 0.2713 286.7)
const ACCENT = rgb(0.44, 0.2, 0.95) // vivid purple (primary)
const ACCENT_LIGHT = rgb(0.93, 0.88, 0.99) // very light purple tint
const PAGE_HEADER_H = 38

function displayName(t: { teamNumber: number | null }): string {
    return t.teamNumber !== null ? `Team ${t.teamNumber}` : "Team —"
}

function formatPlayerName(name: string, oldId: number | null): string {
    return oldId != null ? `${name} (${oldId})` : name
}

function gridCols(teamCount: number): number {
    if (teamCount <= 4) return 2
    if (teamCount <= 6) return 3
    return Math.ceil(teamCount / 2)
}

/** Count how many of this team's pre-assigned picks (captain + pair) are non-male. */
function countNonMalePrefills(team: TeamSheetData): number {
    let count = 0
    if (team.captainIsMale === false) count++
    const pairPick = team.picks.find((p) => !p.isCaptain)
    if (pairPick && pairPick.isMale === false) count++
    return count
}

interface Fonts {
    bold: PDFFont
    regular: PDFFont
}

function drawTeamCell(
    page: PDFPage,
    fonts: Fonts,
    x: number,
    y: number, // top-left corner of cell (Y measured from page top)
    w: number,
    h: number,
    teamLabel: string,
    captainDisplayName: string,
    captainLabel: string,
    additionalCoaches: { name: string; oldId: number | null }[],
    nonMaleCount: number,
    prefillNonMaleCount: number,
    picks: {
        round: number
        playerName: string
        oldId: number | null
        isCaptain: boolean
    }[],
    prefilled: boolean,
    pageHeight: number
) {
    const toY = (topY: number) => pageHeight - topY

    // Cell border + white background
    page.drawRectangle({
        x,
        y: toY(y + h),
        width: w,
        height: h,
        borderColor: ACCENT,
        borderWidth: 1,
        color: rgb(1, 1, 1)
    })

    const pad = 6
    let cursor = y + pad

    // --- Colored header strip ---
    const headerH = 18
    page.drawRectangle({
        x: x + 0.5,
        y: toY(cursor + headerH) - 0.5,
        width: w - 1,
        height: headerH,
        color: ACCENT_LIGHT
    })

    // Team label — centered in header strip
    const teamLabelSize = 10
    const teamLabelW = fonts.bold.widthOfTextAtSize(teamLabel, teamLabelSize)
    page.drawText(teamLabel, {
        x: x + (w - teamLabelW) / 2,
        y: toY(cursor + headerH) + 4,
        size: teamLabelSize,
        font: fonts.bold,
        color: ACCENT
    })
    cursor += headerH + 4

    // --- Captain/coach name line ---
    const captLabel = captainLabel
    const captLabelSize = 8.5
    const captLabelWidth = fonts.bold.widthOfTextAtSize(
        captLabel,
        captLabelSize
    )
    page.drawText(captLabel, {
        x: x + pad,
        y: toY(cursor + 10),
        size: captLabelSize,
        font: fonts.bold,
        color: rgb(0.3, 0.3, 0.3)
    })
    const NAME_INDENT = 36
    if (prefilled && captainDisplayName) {
        page.drawText(captainDisplayName, {
            x: x + pad + captLabelWidth + NAME_INDENT,
            y: toY(cursor + 10),
            size: captLabelSize,
            font: fonts.regular,
            color: rgb(0, 0, 0)
        })
    }
    cursor += 14

    // --- Additional coach lines (coaches divisions only) ---
    for (const coach of additionalCoaches) {
        page.drawText(captLabel, {
            x: x + pad,
            y: toY(cursor + 10),
            size: captLabelSize,
            font: fonts.bold,
            color: rgb(0.3, 0.3, 0.3)
        })
        if (prefilled && coach.name) {
            page.drawText(formatPlayerName(coach.name, coach.oldId), {
                x: x + pad + captLabelWidth + NAME_INDENT,
                y: toY(cursor + 10),
                size: captLabelSize,
                font: fonts.regular,
                color: rgb(0, 0, 0)
            })
        }
        cursor += 14
    }

    // --- 8 pick lines evenly spaced ---
    const TALLY_H = 28
    const pickAreaH = h - (cursor - y) - TALLY_H
    const pickLineH = pickAreaH / 8

    const pickMap = new Map(picks.map((p) => [p.round, p]))
    const nameSize = 8.5

    for (let round = 1; round <= 8; round++) {
        const numLabel = `${round}.`
        const numSize = 7.5
        const numW = fonts.bold.widthOfTextAtSize(numLabel, numSize)
        const textBaseY = cursor + pickLineH * 0.72

        page.drawText(numLabel, {
            x: x + pad,
            y: toY(textBaseY),
            size: numSize,
            font: fonts.bold,
            color: rgb(0.4, 0.4, 0.4)
        })

        const lineStartX = x + pad + numW + 2
        const lineEndX = x + w - pad

        if (prefilled) {
            const pick = pickMap.get(round)
            if (pick) {
                const label = pick.isCaptain
                    ? formatPlayerName(pick.playerName, pick.oldId)
                    : `${formatPlayerName(pick.playerName, pick.oldId)} *`
                page.drawText(label, {
                    x: lineStartX + NAME_INDENT,
                    y: toY(textBaseY),
                    size: nameSize,
                    font: pick.isCaptain ? fonts.bold : fonts.regular,
                    color: rgb(0, 0, 0)
                })
            }
        }

        page.drawLine({
            start: { x: lineStartX, y: toY(cursor + pickLineH - 1) },
            end: { x: lineEndX, y: toY(cursor + pickLineH - 1) },
            thickness: 0.4,
            color: rgb(0.78, 0.78, 0.78)
        })

        cursor += pickLineH
    }

    // --- Non-male tally section ---
    const tallyTop = y + h - TALLY_H

    const tallyLabel = "Non-male: "
    const tallyLabelSize = 6.5
    const tallyLabelW = fonts.regular.widthOfTextAtSize(
        tallyLabel,
        tallyLabelSize
    )
    page.drawText(tallyLabel, {
        x: x + pad,
        y: toY(tallyTop + 19),
        size: tallyLabelSize,
        font: fonts.regular,
        color: rgb(0.35, 0.35, 0.35)
    })

    const boxSize = 11
    const boxGap = 3
    let boxX = x + pad + tallyLabelW + 4
    const boxTopY = tallyTop + 11

    for (let i = 0; i < nonMaleCount; i++) {
        page.drawRectangle({
            x: boxX,
            y: toY(boxTopY + boxSize),
            width: boxSize,
            height: boxSize,
            borderColor: ACCENT,
            borderWidth: 0.7,
            color: rgb(1, 1, 1)
        })

        // Draw "x" in boxes that correspond to known non-male prefills (prefilled sheet only)
        if (prefilled && i < prefillNonMaleCount) {
            const cx = boxX + boxSize / 2
            const cy = boxTopY + boxSize / 2
            const half = boxSize * 0.3
            page.drawLine({
                start: { x: cx - half, y: toY(cy - half) },
                end: { x: cx + half, y: toY(cy + half) },
                thickness: 1,
                color: rgb(0, 0, 0)
            })
            page.drawLine({
                start: { x: cx + half, y: toY(cy - half) },
                end: { x: cx - half, y: toY(cy + half) },
                thickness: 1,
                color: rgb(0, 0, 0)
            })
        }

        boxX += boxSize + boxGap
    }
}

async function buildPdf(
    data: DraftSheetPayload,
    prefilled: boolean
): Promise<Uint8Array> {
    const doc = await PDFDocument.create()
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)
    const regularFont = await doc.embedFont(StandardFonts.Helvetica)
    const fonts: Fonts = { bold: boldFont, regular: regularFont }

    for (const div of data.divisions) {
        const page = doc.addPage([PAGE_W, PAGE_H])
        drawDivisionPage(page, fonts, div, data.seasonLabel, prefilled)
    }

    return doc.save()
}

function drawDivisionPage(
    page: PDFPage,
    fonts: Fonts,
    div: DivisionSheetData,
    seasonLabel: string,
    prefilled: boolean
) {
    const { width: pageW, height: pageH } = page.getSize()

    // --- Full-width colored title bar ---
    page.drawRectangle({
        x: 0,
        y: pageH - PAGE_HEADER_H,
        width: pageW,
        height: PAGE_HEADER_H,
        color: ACCENT
    })

    // Title text — centered in the bar
    const titleText = `BSD Volleyball  —  ${div.divisionName} Division  —  ${seasonLabel} Draft Sheet`
    const titleSize = 13
    const titleW = fonts.bold.widthOfTextAtSize(titleText, titleSize)
    page.drawText(titleText, {
        x: (pageW - titleW) / 2,
        y: pageH - PAGE_HEADER_H + (PAGE_HEADER_H - titleSize) / 2,
        size: titleSize,
        font: fonts.bold,
        color: rgb(1, 1, 1)
    })

    // Circle only on blank sheet
    if (!prefilled) {
        const circleR = 18
        const circleX = pageW - MARGIN / 2 - circleR / 2
        const circleY = PAGE_HEADER_H / 2
        page.drawCircle({
            x: circleX,
            y: pageH - circleY,
            size: circleR,
            borderColor: rgb(1, 1, 1),
            borderWidth: 1.5,
            color: rgb(1, 1, 1)
        })
    }

    // --- Grid layout ---
    const teamCount = div.teamCount
    const cols = gridCols(teamCount)
    const rows = Math.ceil(teamCount / cols)
    const captainLabel = div.isCoaches ? "Coach: " : "Capt: "

    const gridTop = PAGE_HEADER_H + 8
    const gridBottom = pageH - MARGIN
    const gridLeft = MARGIN
    const gridRight = pageW - MARGIN

    const totalW = gridRight - gridLeft
    const totalH = gridBottom - gridTop

    const cellW = (totalW - CELL_GAP * (cols - 1)) / cols
    const cellH = (totalH - CELL_GAP * (rows - 1)) / rows

    for (let idx = 0; idx < teamCount; idx++) {
        const col = idx % cols
        const row = Math.floor(idx / cols)

        const cellX = gridLeft + col * (cellW + CELL_GAP)
        const cellY = gridTop + row * (cellH + CELL_GAP)

        const team = div.teams[idx]
        const teamLabel = team
            ? div.isCoaches
                ? team.teamName
                : displayName(team)
            : `Team ${idx + 1}`
        const captainDisplay = team
            ? formatPlayerName(team.captainName, team.captainOldId)
            : ""
        const prefillNonMaleCount =
            team && !div.isCoaches ? countNonMalePrefills(team) : 0

        drawTeamCell(
            page,
            fonts,
            cellX,
            cellY,
            cellW,
            cellH,
            teamLabel,
            captainDisplay,
            captainLabel,
            team?.additionalCoaches ?? [],
            div.nonMaleCount,
            prefillNonMaleCount,
            team && prefilled ? team.picks : [],
            prefilled,
            pageH
        )
    }
}

export async function generateBlankDraftSheet(
    data: DraftSheetPayload
): Promise<Uint8Array> {
    return buildPdf(data, false)
}

export async function generatePrefilledDraftSheet(
    data: DraftSheetPayload
): Promise<Uint8Array> {
    return buildPdf(data, true)
}
