import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import {
    PDFDocument,
    type PDFPage,
    type PDFFont,
    StandardFonts,
    rgb
} from "pdf-lib"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { divisions, users, week2Rosters } from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"

export const runtime = "nodejs"

interface NametagRow {
    sessionNumber: number
    courtNumber: number
    oldId: number | null
    firstName: string
    lastName: string
    preferredName: string | null
    picture: string | null
}

const LEGACY_COURT_BY_DIVISION: Record<string, number> = {
    AA: 1,
    A: 2,
    ABA: 3,
    ABB: 4,
    BB: 7,
    BBB: 8
}

function getSessionNumberFromTeam(teamNumber: number): 1 | 2 | 3 {
    if (teamNumber <= 2) {
        return 1
    }

    if (teamNumber <= 4) {
        return 2
    }

    return 3
}

function normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, " ")
}

function getPreferredFirstName(row: NametagRow): string {
    const preferred = row.preferredName ? normalizeName(row.preferredName) : ""
    if (preferred) {
        return preferred
    }

    return normalizeName(row.firstName)
}

function getInitials(firstName: string, lastName: string): string {
    const firstInitial = firstName.charAt(0).toUpperCase()
    const lastInitial = lastName.charAt(0).toUpperCase()
    return `${firstInitial}${lastInitial}`
}

function fitFontSize({
    text,
    maxWidth,
    preferredSize,
    minSize,
    font
}: {
    text: string
    maxWidth: number
    preferredSize: number
    minSize: number
    font: PDFFont
}): number {
    let currentSize = preferredSize
    while (
        currentSize > minSize &&
        font.widthOfTextAtSize(text, currentSize) > maxWidth
    ) {
        currentSize -= 1
    }

    return currentSize
}

function drawCenteredText({
    page,
    text,
    centerX,
    y,
    size,
    font,
    color
}: {
    page: PDFPage
    text: string
    centerX: number
    y: number
    size: number
    font: PDFFont
    color: ReturnType<typeof rgb>
}) {
    const textWidth = font.widthOfTextAtSize(text, size)
    page.drawText(text, {
        x: centerX - textWidth / 2,
        y,
        size,
        font,
        color
    })
}

function drawStyledCenteredText({
    page,
    text,
    centerX,
    y,
    size,
    font,
    outlineOffset,
    outlineColor,
    fillColor
}: {
    page: PDFPage
    text: string
    centerX: number
    y: number
    size: number
    font: PDFFont
    outlineOffset: number
    outlineColor: ReturnType<typeof rgb>
    fillColor: ReturnType<typeof rgb>
}) {
    const textWidth = font.widthOfTextAtSize(text, size)
    const leftX = centerX - textWidth / 2
    const offset = outlineOffset

    for (const [dx, dy] of [
        [-offset, 0],
        [offset, 0],
        [0, -offset],
        [0, offset],
        [-offset, -offset],
        [-offset, offset],
        [offset, -offset],
        [offset, offset]
    ]) {
        page.drawText(text, {
            x: leftX + dx,
            y: y + dy,
            size,
            font,
            color: outlineColor
        })
    }

    page.drawText(text, {
        x: leftX,
        y,
        size,
        font,
        color: fillColor
    })
}

function drawPageFooter({
    page,
    pageWidth,
    sessionNumber,
    sessionTime,
    pageNumber,
    totalPages,
    font
}: {
    page: PDFPage
    pageWidth: number
    sessionNumber: number
    sessionTime: string
    pageNumber: number
    totalPages: number
    font: PDFFont
}) {
    const footerSize = 10
    const footerColor = rgb(0.2, 0.2, 0.2)
    const footerY = 24
    const sessionLabel = sessionTime
        ? `SESSION #${sessionNumber} NAMETAGS • ${sessionTime}`
        : `SESSION #${sessionNumber} NAMETAGS`
    drawCenteredText({
        page,
        text: sessionLabel,
        centerX: pageWidth / 2,
        y: footerY,
        size: footerSize,
        font,
        color: footerColor
    })

    const pageLabel = `Page ${pageNumber} out of ${totalPages}`
    const pageLabelWidth = font.widthOfTextAtSize(pageLabel, footerSize)
    page.drawText(pageLabel, {
        x: pageWidth - 18 - pageLabelWidth,
        y: footerY,
        size: footerSize,
        font,
        color: footerColor
    })
}

function drawNametag({
    page,
    x,
    y,
    width,
    height,
    row,
    sessionTime,
    initialsFont,
    idFont,
    detailsFont
}: {
    page: PDFPage
    x: number
    y: number
    width: number
    height: number
    row: NametagRow
    sessionTime: string
    initialsFont: PDFFont
    idFont: PDFFont
    detailsFont: PDFFont
}) {
    const preferredFirst = getPreferredFirstName(row)
    const normalizedLast = normalizeName(row.lastName)
    const initials = getInitials(preferredFirst, normalizedLast)
    const missingPicture = row.picture === null

    const headline = initials
    const oldIdLabel = row.oldId === null ? "—" : String(row.oldId)
    const normalizedFirst = normalizeName(row.firstName)
    const fullName = `${normalizedFirst} ${normalizedLast}`
    const legalNameLabel =
        fullName.length > 25
            ? `${normalizedLast.toUpperCase()}, ${normalizedFirst.charAt(0).toUpperCase()}.`
            : `${normalizedLast.toUpperCase()}, ${normalizedFirst.toUpperCase()}`
    const courtLabel = `Court ${row.courtNumber}`
    const sessionTimeLabel = sessionTime.trim()

    const contentWidth = width - 20
    const centerX = x + width / 2

    const headlineSize = fitFontSize({
        text: headline,
        maxWidth: contentWidth,
        preferredSize: 96,
        minSize: 68,
        font: initialsFont
    })

    const fourDigitOldIdSize = fitFontSize({
        text: "0000",
        maxWidth: contentWidth,
        preferredSize: 165,
        minSize: 118,
        font: idFont
    })

    const oldIdSize = /^\d{3}$/.test(oldIdLabel)
        ? fourDigitOldIdSize
        : fitFontSize({
              text: oldIdLabel,
              maxWidth: contentWidth,
              preferredSize: 165,
              minSize: 118,
              font: idFont
          })

    const legalNameSize = fitFontSize({
        text: legalNameLabel,
        maxWidth: contentWidth,
        preferredSize: 19,
        minSize: 12,
        font: detailsFont
    })

    const initialsY = y + height - 92

    drawStyledCenteredText({
        page,
        text: headline,
        centerX,
        y: initialsY,
        size: headlineSize,
        font: initialsFont,
        outlineOffset: 1.8,
        outlineColor: rgb(0, 0, 0),
        fillColor: rgb(0.7, 0.7, 0.7)
    })

    if (missingPicture) {
        const headlineWidth = initialsFont.widthOfTextAtSize(
            headline,
            headlineSize
        )
        const iconShiftX = 18
        const iconX = centerX + headlineWidth / 2 + 16 + iconShiftX
        const iconY = initialsY + headlineSize * 0.42 - 6.5
        const iconStroke = rgb(0, 0, 0)

        page.drawRectangle({
            x: iconX,
            y: iconY,
            width: 18,
            height: 13,
            borderWidth: 1,
            borderColor: iconStroke
        })

        page.drawRectangle({
            x: iconX + 3,
            y: iconY + 13,
            width: 7,
            height: 3,
            borderWidth: 1,
            borderColor: iconStroke
        })

        page.drawCircle({
            x: iconX + 12,
            y: iconY + 6.5,
            size: 2.8,
            borderWidth: 1,
            borderColor: iconStroke
        })

        drawCenteredText({
            page,
            text: courtLabel,
            centerX: iconX + 9,
            y: iconY - 14,
            size: 9,
            font: detailsFont,
            color: rgb(0.15, 0.15, 0.15)
        })

        if (sessionTimeLabel) {
            drawCenteredText({
                page,
                text: sessionTimeLabel,
                centerX: iconX + 9,
                y: iconY - 24,
                size: 8,
                font: detailsFont,
                color: rgb(0.15, 0.15, 0.15)
            })
        }
    } else {
        const headlineWidth = initialsFont.widthOfTextAtSize(
            headline,
            headlineSize
        )
        const labelCenterX = centerX + headlineWidth / 2 + 25 + 18
        const labelY = initialsY + headlineSize * 0.42 - 20.5

        drawCenteredText({
            page,
            text: courtLabel,
            centerX: labelCenterX,
            y: labelY,
            size: 9,
            font: detailsFont,
            color: rgb(0.15, 0.15, 0.15)
        })

        if (sessionTimeLabel) {
            drawCenteredText({
                page,
                text: sessionTimeLabel,
                centerX: labelCenterX,
                y: labelY - 10,
                size: 8,
                font: detailsFont,
                color: rgb(0.15, 0.15, 0.15)
            })
        }
    }

    drawStyledCenteredText({
        page,
        text: oldIdLabel,
        centerX,
        y: y + 52,
        size: oldIdSize,
        font: idFont,
        outlineOffset: 2.4,
        outlineColor: rgb(0.7, 0.7, 0.7),
        fillColor: rgb(0, 0, 0)
    })

    drawCenteredText({
        page,
        text: legalNameLabel,
        centerX,
        y: y + 24,
        size: legalNameSize,
        font: detailsFont,
        color: rgb(0, 0, 0)
    })
}

export async function GET() {
    const hasAccess = await isAdminOrDirectorBySession()
    if (!hasAccess) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    try {
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return NextResponse.json(
                { error: "No current season found." },
                { status: 400 }
            )
        }

        const rosterRows = await db
            .select({
                teamNumber: week2Rosters.team_number,
                divisionId: week2Rosters.division,
                divisionName: divisions.name,
                divisionLevel: divisions.level,
                oldId: users.old_id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
                picture: users.picture
            })
            .from(week2Rosters)
            .innerJoin(users, eq(week2Rosters.user, users.id))
            .innerJoin(divisions, eq(week2Rosters.division, divisions.id))
            .where(eq(week2Rosters.season, config.seasonId))
            .orderBy(
                divisions.level,
                week2Rosters.team_number,
                users.last_name,
                users.first_name
            )

        const normalizedRows: NametagRow[] = rosterRows.map((row) => ({
            sessionNumber: getSessionNumberFromTeam(row.teamNumber),
            courtNumber:
                LEGACY_COURT_BY_DIVISION[row.divisionName] ??
                row.divisionLevel ??
                row.divisionId,
            oldId: row.oldId,
            firstName: row.firstName,
            lastName: row.lastName,
            preferredName: row.preferredName,
            picture: row.picture
        }))

        const sessionTimes: Record<number, string> = {
            1: config.tryout2Session1Time.trim(),
            2: config.tryout2Session2Time.trim(),
            3: config.tryout2Session3Time.trim()
        }

        if (normalizedRows.length === 0) {
            return NextResponse.json(
                {
                    error: "No week 2 roster rows found."
                },
                { status: 404 }
            )
        }

        const pdfDoc = await PDFDocument.create()
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

        const pageWidth = 612
        const pageHeight = 792
        const columns = 2
        const rowsPerPage = 3
        const marginX = 18
        const marginY = 36
        const gutterX = 12
        const gutterY = 0
        const labelWidth =
            (pageWidth - marginX * 2 - gutterX * (columns - 1)) / columns
        const labelHeight =
            (pageHeight - marginY * 2 - gutterY * (rowsPerPage - 1)) /
            rowsPerPage

        for (const sessionNumber of [1, 2, 3]) {
            const sessionRows = normalizedRows.filter(
                (row) => row.sessionNumber === sessionNumber
            )

            if (sessionRows.length === 0) {
                continue
            }

            const sessionTime = sessionTimes[sessionNumber]
            const totalPages = Math.ceil(sessionRows.length / 6)
            let pageNumber = 1

            for (let start = 0; start < sessionRows.length; start += 6) {
                const page = pdfDoc.addPage([pageWidth, pageHeight])
                const chunk = sessionRows.slice(start, start + 6)

                for (let index = 0; index < chunk.length; index++) {
                    const row = chunk[index]
                    const col = index % columns
                    const gridRow = Math.floor(index / columns)
                    const x = marginX + col * (labelWidth + gutterX)
                    const y =
                        pageHeight -
                        marginY -
                        (gridRow + 1) * labelHeight -
                        gridRow * gutterY

                    drawNametag({
                        page,
                        x,
                        y,
                        width: labelWidth,
                        height: labelHeight,
                        row,
                        sessionTime,
                        initialsFont: regularFont,
                        idFont: regularFont,
                        detailsFont: regularFont
                    })
                }

                drawPageFooter({
                    page,
                    pageWidth,
                    sessionNumber,
                    sessionTime,
                    pageNumber,
                    totalPages,
                    font: regularFont
                })

                pageNumber += 1
            }
        }

        const pdfBytes = await pdfDoc.save()
        const seasonSlug = config.seasonName
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
        const downloadFileName = `bsd-week2-nametags-${seasonSlug}-${config.seasonYear}.pdf`

        const session = await auth.api.getSession({ headers: await headers() })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "read",
                entityType: "week2_rosters",
                summary: `Downloaded week 2 nametag labels PDF for season ${config.seasonId}`
            })
        }

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${downloadFileName}"`,
                "Cache-Control": "no-store"
            }
        })
    } catch (error) {
        console.error("Error creating week 2 nametag labels PDF:", error)
        return NextResponse.json(
            { error: "Failed to generate nametag labels PDF." },
            { status: 500 }
        )
    }
}
