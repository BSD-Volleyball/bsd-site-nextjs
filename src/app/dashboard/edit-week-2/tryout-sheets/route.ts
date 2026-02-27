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
    week2Rosters
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import { formatHeight } from "@/components/player-detail/format-height"

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
    teamNumber: number
}

interface GroupDescriptor {
    divisionName: string
    courtNumber: number
    sessionNumber: 1 | 2 | 3
    homeTeam: number
    awayTeam: number
}

interface GroupData {
    descriptor: GroupDescriptor
    homeRows: TryoutSheetRow[]
    awayRows: TryoutSheetRow[]
}

const PAGE_DIVISIONS: [string[], string[]] = [
    ["AA", "A", "ABA"],
    ["ABB", "BBB", "BB"]
]

const LEGACY_COURT_BY_DIVISION: Record<string, number> = {
    AA: 1,
    A: 2,
    ABA: 3,
    ABB: 4,
    BBB: 8,
    BB: 7
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

function fitTextToCell({
    text,
    maxWidth,
    baseFontSize,
    minFontSize,
    font
}: {
    text: string
    maxWidth: number
    baseFontSize: number
    minFontSize: number
    font: Awaited<ReturnType<typeof PDFDocument.create>> extends infer T
        ? T extends PDFDocument
            ? Awaited<ReturnType<T["embedFont"]>>
            : never
        : never
}): { text: string; fontSize: number } {
    if (!text) {
        return { text: "", fontSize: baseFontSize }
    }

    let fontSize = baseFontSize

    while (
        fontSize > minFontSize &&
        font.widthOfTextAtSize(text, fontSize) > maxWidth
    ) {
        fontSize -= 0.5
    }

    if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) {
        return { text, fontSize }
    }

    return {
        text: truncateToFit({
            text,
            maxWidth,
            fontSize,
            font
        }),
        fontSize
    }
}

function getSessionMatchup(sessionNumber: 1 | 2 | 3): {
    homeTeam: number
    awayTeam: number
} {
    if (sessionNumber === 1) {
        return { homeTeam: 1, awayTeam: 2 }
    }

    if (sessionNumber === 2) {
        return { homeTeam: 3, awayTeam: 4 }
    }

    return { homeTeam: 5, awayTeam: 6 }
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
                divisionName: divisions.name,
                teamNumber: week2Rosters.team_number,
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
            .from(week2Rosters)
            .innerJoin(users, eq(week2Rosters.user, users.id))
            .innerJoin(divisions, eq(week2Rosters.division, divisions.id))
            .leftJoin(
                signups,
                and(
                    eq(signups.player, week2Rosters.user),
                    eq(signups.season, config.seasonId)
                )
            )
            .where(eq(week2Rosters.season, config.seasonId))
            .orderBy(divisions.level, week2Rosters.team_number, users.last_name)

        if (rosterRows.length === 0) {
            return NextResponse.json(
                {
                    error: "No week 2 tryout roster rows found for current season."
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

        const rowsByDivisionTeam = new Map<string, TryoutSheetRow[]>()
        for (const row of rosterRows) {
            const key = `${row.divisionName}-${row.teamNumber}`
            const currentRows = rowsByDivisionTeam.get(key) || []
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
                hasBlankHistory: !latestDraft,
                teamNumber: row.teamNumber
            })

            rowsByDivisionTeam.set(key, currentRows)
        }

        for (const rows of rowsByDivisionTeam.values()) {
            rows.sort((a, b) => {
                if (a.teamNumber !== b.teamNumber) {
                    return a.teamNumber - b.teamNumber
                }
                return a.name.localeCompare(b.name)
            })
        }

        const groupsBySessionPage = new Map<string, GroupData[]>()
        const sessions: Array<1 | 2 | 3> = [1, 2, 3]

        for (const sessionNumber of sessions) {
            const matchup = getSessionMatchup(sessionNumber)

            for (
                let pageIndex = 0;
                pageIndex < PAGE_DIVISIONS.length;
                pageIndex++
            ) {
                const pageDivisions = PAGE_DIVISIONS[pageIndex]
                const groups: GroupData[] = []

                for (const divisionName of pageDivisions) {
                    const homeRows =
                        rowsByDivisionTeam.get(
                            `${divisionName}-${matchup.homeTeam}`
                        ) || []
                    const awayRows =
                        rowsByDivisionTeam.get(
                            `${divisionName}-${matchup.awayTeam}`
                        ) || []

                    groups.push({
                        descriptor: {
                            divisionName,
                            courtNumber:
                                LEGACY_COURT_BY_DIVISION[divisionName] || 0,
                            sessionNumber,
                            homeTeam: matchup.homeTeam,
                            awayTeam: matchup.awayTeam
                        },
                        homeRows: [...homeRows].sort((a, b) =>
                            a.name.localeCompare(b.name)
                        ),
                        awayRows: [...awayRows].sort((a, b) =>
                            a.name.localeCompare(b.name)
                        )
                    })
                }

                groupsBySessionPage.set(`${sessionNumber}-${pageIndex}`, groups)
            }
        }

        const pdfDoc = await PDFDocument.create()
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

        const pageWidth = 792
        const pageHeight = 612
        const margin = 24
        const headerTextSize = 9
        const subheaderTextSize = 9
        const cellFontSize = 9
        const headerRowHeight = 14
        const sectionGap = 0
        const titleBlockHeight = 16
        const groupAreaHeight =
            (pageHeight - margin * 2 - titleBlockHeight - sectionGap * 2) / 3
        const tableWidth = pageWidth - margin * 2
        const tableGap = 0
        const singleTableWidth = (tableWidth - tableGap) / 2
        const getCellTextY = (
            topY: number,
            cellHeight: number,
            fontSize: number
        ) => topY - (cellHeight + fontSize) / 2

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

        const ldWidth = Math.min(
            30,
            getColumnWidth({
                header: "LD",
                values: Array.from(latestDraftByUser.values()).map(
                    (draft) => draft.divisionLabel
                ),
                minWidth: 18
            })
        )

        const lsWidth = Math.min(
            24,
            getColumnWidth({
                header: "LS",
                values: Array.from(latestDraftByUser.values()).map(
                    (draft) => draft.seasonLabel
                ),
                minWidth: 18
            })
        )

        const idWidth = Math.min(
            30,
            getColumnWidth({
                header: "ID",
                values: rosterRows.map((row) =>
                    row.oldId === null ? "—" : String(row.oldId)
                ),
                minWidth: 18
            })
        )

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

        const heightWidth = Math.min(
            30,
            getColumnWidth({
                header: "H",
                values: rosterRows.map((row) => formatHeight(row.height)),
                minWidth: 14
            })
        )

        const genderWidth = Math.min(
            22,
            getColumnWidth({
                header: "M?",
                values: rosterRows.map((row) => getGenderLabel(row.male)),
                minWidth: 14
            })
        )

        const pairWidth = Math.min(
            64,
            getColumnWidth({
                header: "Pair",
                values: Array.from(pairNameById.values()),
                minWidth: 44
            })
        )

        const staticOccupied =
            idWidth +
            pairWidth +
            ldWidth +
            lsWidth +
            positionsWidth +
            heightWidth +
            genderWidth
        const notesWidth = 60
        const nameWidth = Math.max(
            84,
            singleTableWidth - staticOccupied - notesWidth
        )

        const columns = [
            { key: "id", label: "ID", width: idWidth },
            { key: "name", label: "Name", width: nameWidth },
            { key: "pair", label: "Pair", width: pairWidth },
            { key: "lastDivision", label: "LD", width: ldWidth },
            { key: "lastSeason", label: "LS", width: lsWidth },
            { key: "positions", label: "Pos", width: positionsWidth },
            { key: "height", label: "H", width: heightWidth },
            { key: "gender", label: "M?", width: genderWidth },
            {
                key: "notes",
                label: "Notes",
                width: notesWidth
            }
        ] as const

        const generatedTimestamp = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        }).format(new Date())

        const sessionTimeMap: Record<1 | 2 | 3, string> = {
            1: config.tryout2Session1Time.trim(),
            2: config.tryout2Session2Time.trim(),
            3: config.tryout2Session3Time.trim()
        }

        const highlightYellow = rgb(1, 0.98, 0.8)
        const highlightGreen = rgb(0.88, 0.97, 0.88)

        for (const sessionNumber of sessions) {
            for (
                let pageIndex = 0;
                pageIndex < PAGE_DIVISIONS.length;
                pageIndex++
            ) {
                const groups = groupsBySessionPage.get(
                    `${sessionNumber}-${pageIndex}`
                )

                if (!groups || groups.length === 0) {
                    continue
                }

                const page = pdfDoc.addPage([pageWidth, pageHeight])
                const sessionTime = sessionTimeMap[sessionNumber] || "Time TBD"
                const title = `${capitalize(config.seasonName)} ${config.seasonYear} Week 2 Tryout Sheets - Session ${sessionNumber} (${sessionTime}) - Page ${pageIndex + 1}`

                let sectionTopY = pageHeight - margin - titleBlockHeight

                page.drawText(title, {
                    x: margin,
                    y: sectionTopY + 6,
                    size: headerTextSize,
                    font: boldFont,
                    color: rgb(0, 0, 0)
                })

                page.drawText(`Generated ${generatedTimestamp} ET`, {
                    x: pageWidth - margin - 170,
                    y: sectionTopY + 6,
                    size: subheaderTextSize,
                    font: regularFont,
                    color: rgb(0.2, 0.2, 0.2)
                })

                for (const group of groups) {
                    const sessionTime =
                        sessionTimeMap[group.descriptor.sessionNumber] ||
                        "Time TBD"

                    const availableHeight = groupAreaHeight - headerRowHeight
                    const maxRowsInEitherTeam = Math.max(
                        group.homeRows.length,
                        group.awayRows.length,
                        1
                    )
                    const rowHeight = Math.max(
                        9,
                        availableHeight / maxRowsInEitherTeam
                    )

                    const drawTeamTable = ({
                        startX,
                        rows
                    }: {
                        startX: number
                        rows: TryoutSheetRow[]
                    }) => {
                        let tableTopY = sectionTopY
                        let currentX = startX

                        page.drawRectangle({
                            x: startX,
                            y: tableTopY - headerRowHeight,
                            width: singleTableWidth,
                            height: headerRowHeight,
                            borderWidth: 1,
                            borderColor: rgb(0, 0, 0),
                            color: rgb(0.97, 0.97, 0.97)
                        })

                        const nameHeader = `${group.descriptor.divisionName} C${group.descriptor.courtNumber} ${sessionTime}`

                        for (const column of columns) {
                            const headerText =
                                column.key === "name"
                                    ? nameHeader
                                    : column.label

                            page.drawText(
                                truncateToFit({
                                    text: headerText,
                                    maxWidth: column.width - 8,
                                    fontSize: cellFontSize,
                                    font: boldFont
                                }),
                                {
                                    x: currentX + 4,
                                    y: getCellTextY(
                                        tableTopY,
                                        headerRowHeight,
                                        cellFontSize
                                    ),
                                    size: cellFontSize,
                                    font: boldFont,
                                    color: rgb(0, 0, 0)
                                }
                            )

                            page.drawLine({
                                start: { x: currentX, y: tableTopY },
                                end: {
                                    x: currentX,
                                    y: tableTopY - headerRowHeight
                                },
                                thickness: 1,
                                color: rgb(0, 0, 0)
                            })

                            currentX += column.width
                        }

                        page.drawLine({
                            start: {
                                x: startX + singleTableWidth,
                                y: tableTopY
                            },
                            end: {
                                x: startX + singleTableWidth,
                                y: tableTopY - headerRowHeight
                            },
                            thickness: 1,
                            color: rgb(0, 0, 0)
                        })

                        tableTopY -= headerRowHeight

                        for (const row of rows) {
                            currentX = startX

                            page.drawRectangle({
                                x: startX,
                                y: tableTopY - rowHeight,
                                width: singleTableWidth,
                                height: rowHeight,
                                borderWidth: 1,
                                borderColor: rgb(0, 0, 0)
                            })

                            const values = [
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

                            for (
                                let index = 0;
                                index < columns.length;
                                index++
                            ) {
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
                                        y: tableTopY - rowHeight + 1,
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
                                    start: { x: currentX, y: tableTopY },
                                    end: {
                                        x: currentX,
                                        y: tableTopY - rowHeight
                                    },
                                    thickness: 1,
                                    color: rgb(0, 0, 0)
                                })

                                if (column.key !== "notes" && value) {
                                    const shouldAutoShrink =
                                        column.key === "name" ||
                                        column.key === "pair"

                                    const fitted = shouldAutoShrink
                                        ? fitTextToCell({
                                              text: value,
                                              maxWidth: column.width - 8,
                                              baseFontSize: cellFontSize,
                                              minFontSize: 6,
                                              font: regularFont
                                          })
                                        : {
                                              text: truncateToFit({
                                                  text: value,
                                                  maxWidth: column.width - 8,
                                                  fontSize: cellFontSize,
                                                  font: regularFont
                                              }),
                                              fontSize: cellFontSize
                                          }

                                    page.drawText(fitted.text, {
                                        x: currentX + 4,
                                        y: getCellTextY(
                                            tableTopY,
                                            rowHeight,
                                            fitted.fontSize
                                        ),
                                        size: fitted.fontSize,
                                        font: regularFont,
                                        color: rgb(0, 0, 0)
                                    })
                                }

                                currentX += column.width
                            }

                            page.drawLine({
                                start: {
                                    x: startX + singleTableWidth,
                                    y: tableTopY
                                },
                                end: {
                                    x: startX + singleTableWidth,
                                    y: tableTopY - rowHeight
                                },
                                thickness: 1,
                                color: rgb(0, 0, 0)
                            })

                            tableTopY -= rowHeight
                        }
                    }

                    drawTeamTable({
                        startX: margin,
                        rows: group.homeRows
                    })

                    drawTeamTable({
                        startX: margin + singleTableWidth + tableGap,
                        rows: group.awayRows
                    })

                    sectionTopY -= groupAreaHeight + sectionGap
                }
            }
        }

        const pdfBytes = await pdfDoc.save()
        const seasonSlug = config.seasonName
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
        const downloadFileName = `bsd-week2-${seasonSlug}-${config.seasonYear}.pdf`

        const session = await auth.api.getSession({ headers: await headers() })
        if (session?.user) {
            await logAuditEntry({
                userId: session.user.id,
                action: "read",
                entityType: "week2_rosters",
                summary: `Downloaded week 2 tryout sheets PDF for season ${config.seasonId}`
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
        console.error("Error creating week 2 tryout sheets PDF:", error)
        return NextResponse.json(
            { error: "Failed to generate week 2 tryout sheets PDF." },
            { status: 500 }
        )
    }
}
