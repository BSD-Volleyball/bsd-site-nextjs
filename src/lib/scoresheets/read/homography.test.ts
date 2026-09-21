import { describe, expect, it } from "vitest"

import {
    applyH,
    invertH,
    type Matrix3,
    type Point,
    rectCorners,
    reprojectionRms,
    solveHomography
} from "./homography"

const PAGE: Point[] = [
    { x: 0, y: 0 },
    { x: 612, y: 0 },
    { x: 612, y: 792 },
    { x: 0, y: 792 }
]

function project(h: Matrix3, pts: Point[]): Point[] {
    return pts.map((p) => applyH(h, p))
}

describe("solveHomography", () => {
    it("recovers a known perspective exactly", () => {
        // A plausible hand-held photo: the page tilted away at the top
        const photo: Point[] = [
            { x: 120, y: 60 },
            { x: 1880, y: 140 },
            { x: 1790, y: 2500 },
            { x: 210, y: 2420 }
        ]
        const h = solveHomography(PAGE, photo)
        expect(h).not.toBeNull()
        if (!h) return

        expect(reprojectionRms(h, PAGE, photo)).toBeLessThan(1e-6)
    })

    it("round-trips through its own inverse", () => {
        const photo: Point[] = [
            { x: 100, y: 50 },
            { x: 1900, y: 90 },
            { x: 1850, y: 2600 },
            { x: 150, y: 2500 }
        ]
        const h = solveHomography(PAGE, photo)
        if (!h) throw new Error("no homography")
        const back = invertH(h)
        expect(back).not.toBeNull()
        if (!back) return

        for (const p of [
            { x: 306, y: 396 },
            { x: 522, y: 48 },
            { x: 34, y: 758 }
        ]) {
            const there = applyH(h, p)
            const home = applyH(back, there)
            expect(home.x).toBeCloseTo(p.x, 6)
            expect(home.y).toBeCloseTo(p.y, 6)
        }
    })

    it("uses extra correspondences to average out noise", () => {
        const truth: Point[] = [
            { x: 100, y: 60 },
            { x: 1900, y: 100 },
            { x: 1860, y: 2550 },
            { x: 140, y: 2480 }
        ]
        const h = solveHomography(PAGE, truth)
        if (!h) throw new Error("no homography")

        // Six page points, each observed with a little jitter
        const src: Point[] = [...PAGE, { x: 306, y: 396 }, { x: 522, y: 48 }]
        const jitter = [0.6, -0.5, 0.4, -0.6, 0.5, -0.4]
        const observed = project(h, src).map((p, i) => ({
            x: p.x + jitter[i],
            y: p.y - jitter[i]
        }))

        const fitted = solveHomography(src, observed)
        expect(fitted).not.toBeNull()
        if (!fitted) return

        // The least-squares fit should sit near the truth, not chase the noise
        const clean = project(h, src)
        expect(reprojectionRms(fitted, src, clean)).toBeLessThan(1)
    })

    it("refuses degenerate input", () => {
        const collinear: Point[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 20, y: 0 },
            { x: 30, y: 0 }
        ]
        expect(solveHomography(collinear, PAGE)).toBeNull()
        expect(solveHomography(PAGE.slice(0, 3), PAGE.slice(0, 3))).toBeNull()
        expect(solveHomography(PAGE, PAGE.slice(0, 3))).toBeNull()
    })

    it("maps the identity to itself", () => {
        const h = solveHomography(PAGE, PAGE)
        if (!h) throw new Error("no homography")
        const p = applyH(h, { x: 123, y: 456 })
        expect(p.x).toBeCloseTo(123, 6)
        expect(p.y).toBeCloseTo(456, 6)
    })
})

describe("rectCorners", () => {
    it("walks a rect counter-clockwise from its bottom-left", () => {
        const corners = rectCorners({ x: 10, y: 20, w: 30, h: 40 })
        expect(corners).toEqual([
            { x: 10, y: 20 },
            { x: 10, y: 60 },
            { x: 40, y: 60 },
            { x: 40, y: 20 }
        ])
    })
})

describe("reprojectionRms", () => {
    it("grows with the error it measures", () => {
        const h = solveHomography(PAGE, PAGE)
        if (!h) throw new Error("no homography")
        const off = PAGE.map((p) => ({ x: p.x + 3, y: p.y + 4 }))
        expect(reprojectionRms(h, PAGE, PAGE)).toBeLessThan(1e-9)
        expect(reprojectionRms(h, PAGE, off)).toBeCloseTo(5, 6)
    })
})
