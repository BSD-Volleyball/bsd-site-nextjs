import { NextResponse } from "next/server"
import { and, desc, eq, inArray } from "drizzle-orm"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    drafts,
    divisions,
    seasons,
    signups,
    teams,
    users,
    week1Rosters
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"

export const runtime = "nodejs"

interface TryoutSheetRow {
    idLabel: string
    name: string
    pairName: string
    hasPair: boolean
    positionsLabel: string
    heightLabel: string
    genderLabel: string
    lastSeasonLabel: string
    lastDivisionLabel: string
    hasBlankHistory: boolean
}

function capitalize(value: string): string {
    if (!value) {
        return value
    }
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function getSeasonAbbreviation(seasonName: string): string {
    const normalized = seasonName.trim().toLowerCase()

    if (normalized.startsWith("fall")) {
        return "F"
    }

    if (normalized.startsWith("spring")) {
        return "S"
    }

    if (normalized.startsWith("summer")) {
        return "U"
    }

    return seasonName.charAt(0).toUpperCase()
}

function getDisplayName({
    firstName,
    lastName,
    preferredName
}: {
    firstName: string
    lastName: string
    preferredName: string | null
}): string {
    return `${preferredName || firstName} ${lastName}`
}

function formatHeight(inches: number | null): string {
    if (!inches) {
        return "—"
    }

    const feet = Math.floor(inches / 12)
    const inchesRemainder = inches % 12
    return `${feet}'${inchesRemainder}\"`
}

function getGenderLabel(male: boolean | null): string {
    if (male === true) {
        return "M"
    }

    if (male === false) {
        return "NM"
    }

    return "—"
}

function getPositionsLabel({
    skillSetter,
    skillHitter,
    skillPasser
}: {
    skillSetter: boolean | null
    skillHitter: boolean | null
    skillPasser: boolean | null
}): string {
    const labels: string[] = []

    if (skillSetter) {
        labels.push("S")
    }

    if (skillHitter) {
        labels.push("H")
    }

    if (skillPasser) {
        labels.push("P")
    }

    if (labels.length === 0) {
        return "—"
    }

    return labels.join("/")
}

function truncateToFit({
    text,
    maxWidth,
    fontSize,
    font
}: {
    text: string
    maxWidth: number
    fontSize: number
    font: Awaited<ReturnType<typeof PDFDocument.create>> extends infer T
        ? T extends PDFDocument
            ? Awaited<ReturnType<T["embedFont"]>>
            : never
        : never
}): string {
    if (!text) {
        return ""
    }

    if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) {
        return text
    }

    const ellipsis = "…"
    let shortened = text
    while (shortened.length > 0) {
        shortened = shortened.slice(0, -1)
        const candidate = `${shortened}${ellipsis}`
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
            return candidate
        }
    }

    return ellipsis
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
                sessionNumber: week1Rosters.session_number,
                courtNumber: week1Rosters.court_number,
                userId: users.id,
                oldId: users.old_id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
                pairPickId: signups.pair_pick,
                height: users.height,
                male: users.male,
                skillSetter: users.skill_setter,
                skillHitter: users.skill_hitter,
                skillPasser: users.skill_passer
            })
            .from(week1Rosters)
            .innerJoin(users, eq(week1Rosters.user, users.id))
            .leftJoin(
                signups,
                and(
                    eq(signups.player, week1Rosters.user),
                    eq(signups.season, config.seasonId)
                )
            )
            .where(
                and(
                    eq(week1Rosters.season, config.seasonId),
                    inArray(week1Rosters.session_number, [1, 2])
                )
            )
            .orderBy(
                week1Rosters.session_number,
                week1Rosters.court_number,
                users.last_name,
                users.first_name
            )

        if (rosterRows.length === 0) {
            return NextResponse.json(
                {
                    error: "No week 1 tryout roster rows found for sessions 1-2."
                },
                { status: 404 }
            )
        }

        const userIds = [...new Set(rosterRows.map((row) => row.userId))]
        const pairIds = [
            ...new Set(
                rosterRows
                    .map((row) => row.pairPickId)
                    .filter((pairId): pairId is string => !!pairId)
            )
        ]

        const [pairRows, draftRows] = await Promise.all([
            pairIds.length > 0
                ? db
                      .select({
                          id: users.id,
                          firstName: users.first_name,
                          lastName: users.last_name,
                          preferredName: users.preffered_name
                      })
                      .from(users)
                      .where(inArray(users.id, pairIds))
                : Promise.resolve([]),
            db
                .select({
                    userId: drafts.user,
                    seasonId: seasons.id,
                    seasonName: seasons.season,
                    seasonYear: seasons.year,
                    divisionName: divisions.name,
                    overall: drafts.overall
                })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .innerJoin(seasons, eq(teams.season, seasons.id))
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(inArray(drafts.user, userIds))
                .orderBy(desc(seasons.id), drafts.overall)
        ])

        const pairNameById = new Map<string, string>()
        for (const pair of pairRows) {
            pairNameById.set(pair.id, getDisplayName(pair))
        }

        const latestDraftByUser = new Map<
            string,
            { seasonId: number; seasonLabel: string; divisionLabel: string }
        >()
        for (const draft of draftRows) {
            if (latestDraftByUser.has(draft.userId)) {
                continue
            }

            latestDraftByUser.set(draft.userId, {
                seasonId: draft.seasonId,
                seasonLabel: `${getSeasonAbbreviation(draft.seasonName)}${String(draft.seasonYear).slice(-2)}`,
                divisionLabel: draft.divisionName
            })
        }

        const pageRowsBySessionCourt = new Map<string, TryoutSheetRow[]>()
        for (const row of rosterRows) {
            const key = `${row.sessionNumber}-${row.courtNumber}`
            const currentRows = pageRowsBySessionCourt.get(key) || []
            const latestDraft = latestDraftByUser.get(row.userId)

            currentRows.push({
                idLabel: row.oldId === null ? "—" : String(row.oldId),
                name: getDisplayName(row),
                pairName: row.pairPickId
                    ? (pairNameById.get(row.pairPickId) ?? "—")
                    : "",
                hasPair: !!row.pairPickId,
                positionsLabel: getPositionsLabel({
                    skillSetter: row.skillSetter,
                    skillHitter: row.skillHitter,
                    skillPasser: row.skillPasser
                }),
                heightLabel: formatHeight(row.height),
                genderLabel: getGenderLabel(row.male),
                lastSeasonLabel: latestDraft?.seasonLabel ?? "",
                lastDivisionLabel: latestDraft?.divisionLabel ?? "",
                hasBlankHistory: !latestDraft
            })

            pageRowsBySessionCourt.set(key, currentRows)
        }

        const pdfDoc = await PDFDocument.create()
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

        const pageWidth = 792
        const pageHeight = 612
        const margin = 32
        const headerTextSize = 18
        const subheaderTextSize = 10
        const cellFontSize = 12
        const headerRowHeight = 24
        const tableWidth = pageWidth - margin * 2
        const tableTopY = pageHeight - margin - 72
        const availableRowsHeight = tableTopY - headerRowHeight - margin
        const getCellTextY = (
            topY: number,
            cellHeight: number,
            fontSize: number
        ) => topY - (cellHeight + fontSize) / 2 + 2

        const getColumnWidth = ({
            header,
            values,
            minWidth
        }: {
            header: string
            values: string[]
            minWidth: number
        }) => {
            const headerWidth = boldFont.widthOfTextAtSize(header, cellFontSize)
            const valueWidth = values.length
                ? Math.max(
                      ...values.map((value) =>
                          regularFont.widthOfTextAtSize(value, cellFontSize)
                      )
                  )
                : 0

            return Math.max(
                minWidth,
                Math.ceil(Math.max(headerWidth, valueWidth)) + 8
            )
        }

        const ldWidth = getColumnWidth({
            header: "LD",
            values: Array.from(latestDraftByUser.values()).map(
                (draft) => draft.divisionLabel
            ),
            minWidth: 28
        })

        const lsWidth = getColumnWidth({
            header: "LS",
            values: Array.from(latestDraftByUser.values()).map(
                (draft) => draft.seasonLabel
            ),
            minWidth: 26
        })

        const idWidth = getColumnWidth({
            header: "ID",
            values: rosterRows.map((row) =>
                row.oldId === null ? "—" : String(row.oldId)
            ),
            minWidth: 40
        })

        const positionsWidth = getColumnWidth({
            header: "Pos",
            values: rosterRows.map((row) =>
                getPositionsLabel({
                    skillSetter: row.skillSetter,
                    skillHitter: row.skillHitter,
                    skillPasser: row.skillPasser
                })
            ),
            minWidth: 28
        })

        const heightWidth = getColumnWidth({
            header: "H",
            values: rosterRows.map((row) => formatHeight(row.height)),
            minWidth: 36
        })

        const genderWidth = getColumnWidth({
            header: "M?",
            values: rosterRows.map((row) => getGenderLabel(row.male)),
            minWidth: 34
        })

        const staticColumns = [
            { key: "up", label: "", width: 18 },
            { key: "down", label: "", width: 18 },
            { key: "id", label: "ID", width: idWidth },
            { key: "lastDivision", label: "LD", width: ldWidth },
            { key: "lastSeason", label: "LS", width: lsWidth },
            { key: "positions", label: "Pos", width: positionsWidth },
            { key: "height", label: "H", width: heightWidth },
            { key: "gender", label: "M?", width: genderWidth },
            { key: "notes", label: "Notes - Score 1(BB) - 6(AA)", width: 0 }
        ]

        const nameMaxWidth = Math.max(
            ...rosterRows.map((row) =>
                regularFont.widthOfTextAtSize(getDisplayName(row), cellFontSize)
            ),
            regularFont.widthOfTextAtSize("Name", cellFontSize)
        )

        const pairMaxWidth = Math.max(
            ...rosterRows.map((row) => {
                const pairText = row.pairPickId
                    ? (pairNameById.get(row.pairPickId) ?? "—")
                    : "—"
                return regularFont.widthOfTextAtSize(pairText, cellFontSize)
            }),
            regularFont.widthOfTextAtSize("Pair", cellFontSize)
        )

        const dynamicNameWidth = Math.ceil(nameMaxWidth) + 10
        const dynamicPairWidth = Math.ceil(pairMaxWidth) + 10

        const occupiedWithoutNotes = staticColumns.reduce(
            (sum, column) => sum + column.width,
            0
        )
        const notesMinWidth = 100
        const remainingForNamePair = tableWidth - occupiedWithoutNotes
        const neededForNamePair = dynamicNameWidth + dynamicPairWidth
        const scale =
            neededForNamePair > remainingForNamePair
                ? remainingForNamePair / neededForNamePair
                : 1
        const nameWidth = Math.max(80, Math.floor(dynamicNameWidth * scale))
        const pairWidth = Math.max(80, Math.floor(dynamicPairWidth * scale))

        const usedWidth = occupiedWithoutNotes + nameWidth + pairWidth
        const notesWidth = Math.max(notesMinWidth, tableWidth - usedWidth)

        const columns = [
            staticColumns[0],
            staticColumns[1],
            staticColumns[2],
            { key: "name", label: "Name", width: nameWidth },
            { key: "pair", label: "Pair", width: pairWidth },
            staticColumns[3],
            staticColumns[4],
            staticColumns[5],
            staticColumns[6],
            staticColumns[7],
            { ...staticColumns[8], width: notesWidth }
        ]

        const sessions = [
            ...new Set(rosterRows.map((row) => row.sessionNumber))
        ].sort((a, b) => a - b)

        const generatedTimestamp = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        }).format(new Date())

        const maxRowsPerPage = Math.max(
            1,
            ...Array.from(pageRowsBySessionCourt.values()).map(
                (rows) => rows.length
            )
        )
        const rowHeight = Math.max(
            24,
            Math.min(44, Math.floor(availableRowsHeight / maxRowsPerPage))
        )
        const notesFontSize = Math.max(7, cellFontSize - 2)
        const highlightYellow = rgb(1, 0.98, 0.8)
        const highlightGreen = rgb(0.88, 0.97, 0.88)

        for (const sessionNumber of sessions) {
            for (const courtNumber of [1, 2, 3, 4]) {
                const page = pdfDoc.addPage([pageWidth, pageHeight])
                const title = `${capitalize(config.seasonName)} ${config.seasonYear} Week 1 Tryouts - Session ${sessionNumber} - Court ${courtNumber}`

                page.drawText(title, {
                    x: margin,
                    y: pageHeight - margin - headerTextSize,
                    size: headerTextSize,
                    font: boldFont,
                    color: rgb(0, 0, 0)
                })

                page.drawText(`Generated ${generatedTimestamp} ET`, {
                    x: pageWidth - margin - 180,
                    y: pageHeight - margin - headerTextSize - 18,
                    size: subheaderTextSize,
                    font: regularFont,
                    color: rgb(0.2, 0.2, 0.2)
                })

                let currentY = pageHeight - margin - 72
                let currentX = margin

                page.drawRectangle({
                    x: margin,
                    y: currentY - headerRowHeight,
                    width: tableWidth,
                    height: headerRowHeight,
                    borderWidth: 1,
                    borderColor: rgb(0, 0, 0),
                    color: rgb(0.95, 0.95, 0.95)
                })

                for (const column of columns) {
                    if (column.key === "up" || column.key === "down") {
                        const centerX = currentX + column.width / 2
                        const centerY = currentY - headerRowHeight / 2
                        const arrowHalfHeight = 4
                        const arrowHalfWidth = 3

                        if (column.key === "up") {
                            page.drawLine({
                                start: {
                                    x: centerX,
                                    y: centerY - arrowHalfHeight
                                },
                                end: {
                                    x: centerX,
                                    y: centerY + arrowHalfHeight
                                },
                                thickness: 1,
                                color: rgb(0, 0, 0)
                            })
                            page.drawLine({
                                start: {
                                    x: centerX,
                                    y: centerY + arrowHalfHeight
                                },
                                end: {
                                    x: centerX - arrowHalfWidth,
                                    y: centerY + arrowHalfHeight - 2
                                },
                                thickness: 1,
                                color: rgb(0, 0, 0)
                            })
                            page.drawLine({
                                start: {
                                    x: centerX,
                                    y: centerY + arrowHalfHeight
                                },
                                end: {
                                    x: centerX + arrowHalfWidth,
                                    y: centerY + arrowHalfHeight - 2
                                },
                                thickness: 1,
                                color: rgb(0, 0, 0)
                            })
                        } else {
                            page.drawLine({
                                start: {
                                    x: centerX,
                                    y: centerY + arrowHalfHeight
                                },
                                end: {
                                    x: centerX,
                                    y: centerY - arrowHalfHeight
                                },
                                thickness: 1,
                                color: rgb(0, 0, 0)
                            })
                            page.drawLine({
                                start: {
                                    x: centerX,
                                    y: centerY - arrowHalfHeight
                                },
                                end: {
                                    x: centerX - arrowHalfWidth,
                                    y: centerY - arrowHalfHeight + 2
                                },
                                thickness: 1,
                                color: rgb(0, 0, 0)
                            })
                            page.drawLine({
                                start: {
                                    x: centerX,
                                    y: centerY - arrowHalfHeight
                                },
                                end: {
                                    x: centerX + arrowHalfWidth,
                                    y: centerY - arrowHalfHeight + 2
                                },
                                thickness: 1,
                                color: rgb(0, 0, 0)
                            })
                        }
                    } else {
                        page.drawText(column.label, {
                            x: currentX + 4,
                            y: getCellTextY(
                                currentY,
                                headerRowHeight,
                                cellFontSize
                            ),
                            size: cellFontSize,
                            font: boldFont,
                            color: rgb(0, 0, 0)
                        })
                    }

                    page.drawLine({
                        start: { x: currentX, y: currentY },
                        end: { x: currentX, y: currentY - headerRowHeight },
                        thickness: 1,
                        color: rgb(0, 0, 0)
                    })

                    currentX += column.width
                }

                page.drawLine({
                    start: { x: margin + tableWidth, y: currentY },
                    end: {
                        x: margin + tableWidth,
                        y: currentY - headerRowHeight
                    },
                    thickness: 1,
                    color: rgb(0, 0, 0)
                })

                const key = `${sessionNumber}-${courtNumber}`
                const rows = pageRowsBySessionCourt.get(key) || []
                currentY -= headerRowHeight

                for (const row of rows) {
                    currentX = margin
                    page.drawRectangle({
                        x: margin,
                        y: currentY - rowHeight,
                        width: tableWidth,
                        height: rowHeight,
                        borderWidth: 1,
                        borderColor: rgb(0, 0, 0)
                    })

                    const values = [
                        "",
                        "",
                        row.idLabel,
                        row.name,
                        row.pairName,
                        row.lastDivisionLabel,
                        row.lastSeasonLabel,
                        row.positionsLabel,
                        row.heightLabel,
                        row.genderLabel,
                        ""
                    ]

                    for (let index = 0; index < columns.length; index++) {
                        const column = columns[index]
                        const value = values[index]

                        const shouldHighlight =
                            (column.key === "positions" &&
                                row.positionsLabel.includes("S")) ||
                            (column.key === "gender" &&
                                row.genderLabel === "NM") ||
                            (column.key === "pair" && row.hasPair) ||
                            ((column.key === "lastSeason" ||
                                column.key === "lastDivision") &&
                                row.hasBlankHistory)

                        if (shouldHighlight) {
                            page.drawRectangle({
                                x: currentX + 1,
                                y: currentY - rowHeight + 1,
                                width: column.width - 2,
                                height: rowHeight - 2,
                                color:
                                    column.key === "positions" ||
                                    column.key === "gender"
                                        ? highlightYellow
                                        : highlightGreen
                            })
                        }

                        page.drawLine({
                            start: { x: currentX, y: currentY },
                            end: { x: currentX, y: currentY - rowHeight },
                            thickness: 1,
                            color: rgb(0, 0, 0)
                        })

                        if (column.key === "up" || column.key === "down") {
                            const shouldDrawCheckbox =
                                (column.key !== "up" || courtNumber !== 1) &&
                                (column.key !== "down" || courtNumber !== 4)

                            if (shouldDrawCheckbox) {
                                const checkboxSize = 8
                                page.drawRectangle({
                                    x:
                                        currentX +
                                        (column.width - checkboxSize) / 2,
                                    y:
                                        currentY -
                                        (rowHeight + checkboxSize) / 2,
                                    width: checkboxSize,
                                    height: checkboxSize,
                                    borderWidth: 1,
                                    borderColor: rgb(0, 0, 0)
                                })
                            }
                        }

                        if (column.key === "notes") {
                            const notesBottomInset = 3
                            const notesY =
                                currentY - rowHeight + notesBottomInset

                            page.drawText(
                                truncateToFit({
                                    text: "Pass __  Set __  Hit __  Serve __",
                                    maxWidth: column.width - 8,
                                    fontSize: notesFontSize,
                                    font: regularFont
                                }),
                                {
                                    x: currentX + 4,
                                    y: notesY,
                                    size: notesFontSize,
                                    font: regularFont,
                                    color: rgb(0, 0, 0)
                                }
                            )
                        }

                        if (
                            value &&
                            column.key !== "up" &&
                            column.key !== "down" &&
                            column.key !== "notes"
                        ) {
                            page.drawText(
                                truncateToFit({
                                    text: value,
                                    maxWidth: column.width - 8,
                                    fontSize: cellFontSize,
                                    font: regularFont
                                }),
                                {
                                    x: currentX + 4,
                                    y: getCellTextY(
                                        currentY,
                                        rowHeight,
                                        cellFontSize
                                    ),
                                    size: cellFontSize,
                                    font: regularFont,
                                    color: rgb(0, 0, 0)
                                }
                            )
                        }

                        currentX += column.width
                    }

                    page.drawLine({
                        start: { x: margin + tableWidth, y: currentY },
                        end: {
                            x: margin + tableWidth,
                            y: currentY - rowHeight
                        },
                        thickness: 1,
                        color: rgb(0, 0, 0)
                    })

                    currentY -= rowHeight
                }
            }
        }

        const pdfBytes = await pdfDoc.save()
        const seasonSlug = config.seasonName
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
        const downloadFileName = `bsd-week1-${seasonSlug}-${config.seasonYear}.pdf`

        const session = await auth.api.getSession({ headers: await headers() })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "read",
                entityType: "week1_rosters",
                summary: `Downloaded week 1 tryout sheets PDF for season ${config.seasonId}`
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
        console.error("Error creating week 1 tryout sheets PDF:", error)
        return NextResponse.json(
            { error: "Failed to generate tryout sheets PDF." },
            { status: 500 }
        )
    }
}
