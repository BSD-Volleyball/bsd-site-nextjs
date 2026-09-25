import { describe, expect, it } from "vitest"

import {
    type BoxRect,
    buildSheetGeometry,
    PAGE_HEIGHT,
    PAGE_WIDTH
} from "./layout"
import type { CourtSheet, SheetEventType, SheetMatch } from "./types"

function team(name: string) {
    return { teamId: 1, name, isPlaceholder: false, captains: ["A Captain"] }
}

function courtSheet(matchCount: number, playoff = false): CourtSheet {
    const matches: SheetMatch[] = []
    for (let i = 0; i < matchCount; i++) {
        matches.push({
            matchId: 100 + i,
            orderOnCourt: i + 1,
            divisionName: "AA",
            time: "19:00:00",
            playoff,
            playoffMatchNum: playoff ? i + 1 : null,
            bracket: playoff ? "winners" : null,
            home: team("Home"),
            away: team("Away"),
            referee: "Some Ref",
            backupReferee: null,
            workTeam: playoff ? "Seed 1" : null
        })
    }
    return { court: 4, matches }
}

function overlaps(a: BoxRect, b: BoxRect): boolean {
    return (
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    )
}

const EVENT_TYPES: SheetEventType[] = ["regular_season", "playoff"]
const COUNTS = [1, 2, 3, 4]

describe("buildSheetGeometry", () => {
    it("keeps the corner marks inside what a printer will actually print", () => {
        // The first night in the gym came back with these clipped. A consumer
        // printer refuses to put ink within a quarter inch of the paper and
        // many need half an inch; a half-printed mark moves its own centre,
        // which is the single thing the whole reader depends on.
        const HALF_INCH = 36
        const geometry = buildSheetGeometry(courtSheet(3), "regular_season")

        for (const f of geometry.fiducials) {
            const fromLeft = f.x
            const fromRight = PAGE_WIDTH - (f.x + f.w)
            const fromBottom = f.y
            const fromTop = PAGE_HEIGHT - (f.y + f.h)
            const nearestEdge = Math.min(
                fromLeft,
                fromRight,
                fromBottom,
                fromTop
            )
            expect(nearestEdge).toBeGreaterThanOrEqual(HALF_INCH - 4)
        }
    })

    it("keeps printed content out of the corners the marks occupy", () => {
        const geometry = buildSheetGeometry(courtSheet(4, true), "playoff")
        const boxes: BoxRect[] = [
            geometry.qr,
            geometry.tagQr,
            geometry.refNotes,
            ...geometry.blocks.map((b) => ({
                x: b.x,
                y: b.y,
                w: b.w,
                h: b.h
            })),
            ...geometry.captainInitials.map((i) => i.box)
        ]
        for (const fiducial of geometry.fiducials) {
            for (const box of boxes) {
                expect(overlaps(fiducial, box)).toBe(false)
            }
        }
    })

    it("places four fiducials with a half-size bottom-right marker", () => {
        const geometry = buildSheetGeometry(courtSheet(3), "regular_season")
        expect(geometry.fiducials).toHaveLength(4)

        const [topLeft, topRight, bottomLeft, bottomRight] = geometry.fiducials
        expect(topLeft.w).toBe(topRight.w)
        expect(topLeft.w).toBe(bottomLeft.w)
        // The asymmetric corner is what makes a photo's orientation readable
        expect(bottomRight.w).toBe(topLeft.w / 2)
        expect(bottomRight.h).toBe(topLeft.h / 2)

        for (const fiducial of geometry.fiducials) {
            expect(fiducial.x).toBeGreaterThanOrEqual(0)
            expect(fiducial.y).toBeGreaterThanOrEqual(0)
            expect(fiducial.x + fiducial.w).toBeLessThanOrEqual(PAGE_WIDTH)
            expect(fiducial.y + fiducial.h).toBeLessThanOrEqual(PAGE_HEIGHT)
        }
    })

    it("puts the link QR in the header with room for its caption", () => {
        const geometry = buildSheetGeometry(courtSheet(3), "regular_season")
        const { qr } = geometry

        expect(qr.x + qr.w).toBeLessThanOrEqual(geometry.content.right)
        expect(qr.y + qr.h).toBeLessThanOrEqual(geometry.content.top)
        // A caption line sits below it and must clear the rules block
        expect(qr.y - 8).toBeGreaterThan(
            geometry.rules.y + geometry.rules.h - 8
        )
    })

    it("squares the machine tag off against the ref-notes box", () => {
        const geometry = buildSheetGeometry(courtSheet(3), "regular_season")
        const { tagQr, refNotes } = geometry

        expect(overlaps(tagQr, refNotes)).toBe(false)
        expect(overlaps(tagQr, geometry.qr)).toBe(false)
        // Bottom-right corner, same band as the notes box
        expect(tagQr.x + tagQr.w).toBe(geometry.content.right)
        expect(tagQr.y).toBe(refNotes.y)
        expect(tagQr.h).toBe(refNotes.h)
        expect(refNotes.x + refNotes.w).toBeLessThanOrEqual(tagQr.x)
        // Room beneath it for the printed sheet code
        expect(tagQr.y - 10).toBeGreaterThan(0)
    })

    it("keeps both codes clear of the match blocks", () => {
        const geometry = buildSheetGeometry(courtSheet(4, true), "playoff")
        for (const block of geometry.blocks) {
            const rect = {
                x: block.x,
                y: block.y,
                w: block.w,
                h: block.h
            }
            expect(overlaps(rect, geometry.qr)).toBe(false)
            expect(overlaps(rect, geometry.tagQr)).toBe(false)
        }
    })

    it("keeps the machine tag clear of the corner fiducials", () => {
        const geometry = buildSheetGeometry(courtSheet(2), "regular_season")
        for (const fiducial of geometry.fiducials) {
            expect(overlaps(fiducial, geometry.tagQr)).toBe(false)
            expect(overlaps(fiducial, geometry.refNotes)).toBe(false)
        }
    })

    it("never lets a fiducial collide with a FINAL box", () => {
        const geometry = buildSheetGeometry(courtSheet(4, true), "playoff")
        for (const fiducial of geometry.fiducials) {
            for (const game of geometry.games) {
                for (const digit of game.finalDigits) {
                    expect(overlaps(fiducial, digit)).toBe(false)
                }
            }
        }
    })

    for (const eventType of EVENT_TYPES) {
        for (const count of COUNTS) {
            describe(`${eventType} with ${count} match(es)`, () => {
                const geometry = buildSheetGeometry(
                    courtSheet(count, eventType === "playoff"),
                    eventType
                )

                it("keeps every block inside the printable band", () => {
                    const topLimit = geometry.rules.y
                    const bottomLimit =
                        geometry.refNotes.y + geometry.refNotes.h

                    expect(geometry.blocks).toHaveLength(count)
                    for (const block of geometry.blocks) {
                        expect(block.y + block.h).toBeLessThanOrEqual(topLimit)
                        expect(block.y).toBeGreaterThanOrEqual(bottomLimit)
                        expect(block.x).toBe(geometry.content.left)
                        expect(block.w).toBe(geometry.content.width)
                    }
                })

                it("stacks blocks top to bottom without overlapping", () => {
                    for (let i = 1; i < geometry.blocks.length; i++) {
                        const above = geometry.blocks[i - 1]
                        const below = geometry.blocks[i]
                        expect(below.y + below.h).toBeLessThanOrEqual(above.y)
                    }
                })

                it("emits one cell per team per game", () => {
                    expect(geometry.games).toHaveLength(count * 2 * 3)
                    expect(geometry.captainInitials).toHaveLength(count * 2)
                })

                it("puts each captain's box in that captain's own row", () => {
                    for (const block of geometry.blocks) {
                        for (const row of block.rows) {
                            const entry = geometry.captainInitials.find(
                                (i) =>
                                    i.matchId === block.matchId &&
                                    i.team === row.team
                            )
                            expect(entry).toBeDefined()
                            if (!entry) continue
                            // Inside its own team row, in the label column
                            expect(entry.box.y).toBeGreaterThanOrEqual(row.y)
                            expect(
                                entry.box.y + entry.box.h
                            ).toBeLessThanOrEqual(row.y + row.h)
                            expect(entry.box.x).toBe(block.labelColumn.x)
                        }
                    }
                })

                it("keeps every box within its game column", () => {
                    const columnByKey = new Map<
                        string,
                        { x: number; w: number }
                    >()
                    for (const block of geometry.blocks) {
                        for (const column of block.gameColumns) {
                            columnByKey.set(
                                `${block.matchId}:${column.game}`,
                                column
                            )
                        }
                    }

                    for (const game of geometry.games) {
                        const column = columnByKey.get(
                            `${game.matchId}:${game.game}`
                        )
                        expect(column).toBeDefined()
                        if (!column) continue

                        const boxes: BoxRect[] = [
                            ...game.finalDigits,
                            ...game.timeouts,
                            game.win
                        ]
                        for (const box of boxes) {
                            expect(box.x).toBeGreaterThanOrEqual(column.x)
                            expect(box.x + box.w).toBeLessThanOrEqual(
                                column.x + column.w
                            )
                            expect(box.w).toBeGreaterThan(0)
                            expect(box.h).toBeGreaterThan(0)
                        }
                    }
                })

                it("never overlaps two machine-read boxes", () => {
                    const boxes: BoxRect[] = geometry.games.flatMap((game) => [
                        ...game.finalDigits,
                        ...game.timeouts,
                        game.win
                    ])
                    for (let i = 0; i < boxes.length; i++) {
                        for (let j = i + 1; j < boxes.length; j++) {
                            expect(overlaps(boxes[i], boxes[j])).toBe(false)
                        }
                    }
                })

                it("prints three tally rows with legible cells", () => {
                    for (const game of geometry.games) {
                        expect(game.tally.rows).toBe(3)
                        // Small enough to fit, large enough to slash a pen through
                        expect(game.tally.rowHeight).toBeGreaterThanOrEqual(8)
                        expect(game.tally.cellWidth).toBeGreaterThanOrEqual(9)
                    }
                })

                it("keeps the tally grid clear of the FINAL boxes", () => {
                    for (const game of geometry.games) {
                        for (const digit of game.finalDigits) {
                            expect(overlaps(game.tally, digit)).toBe(false)
                        }
                    }
                })
            })
        }
    }

    it("pre-strikes the playoff starting score but not regular season", () => {
        const playoff = buildSheetGeometry(courtSheet(3, true), "playoff")
        for (const game of playoff.games) {
            expect(game.tally.preStruck).toBe(4)
        }

        const regular = buildSheetGeometry(courtSheet(3), "regular_season")
        for (const game of regular.games) {
            expect(game.tally.preStruck).toBe(0)
            expect(game.tally.maxPoint).toBe(27)
        }
    })

    it("caps block height so a short night is not stretched to fit", () => {
        // One, two and three matches all hit the cap and spread down the page
        // as whitespace between blocks; only a four-match playoff night has to
        // shrink below it.
        for (const count of [1, 2, 3]) {
            const geometry = buildSheetGeometry(
                courtSheet(count),
                "regular_season"
            )
            expect(geometry.blocks[0].h).toBe(150)
        }

        const four = buildSheetGeometry(courtSheet(4, true), "playoff")
        expect(four.blocks[0].h).toBeLessThan(150)
    })
})
