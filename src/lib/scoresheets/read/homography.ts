/**
 * homography.ts — the projective map between a photo and the printed page.
 *
 * A photograph of a flat sheet is related to the sheet itself by a homography:
 * eight unknowns, recoverable from four point correspondences. Once we have
 * it, every rectangle `buildSheetGeometry()` reports can be projected into the
 * photo, which is what turns "a picture of some paper" into "the FINAL box for
 * match 2, home team, game 1 is exactly here".
 *
 * Pure maths, no dependencies, no I/O.
 */

export interface Point {
    x: number
    y: number
}

/** Row-major 3x3, with h[8] fixed at 1. */
export type Matrix3 = readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
]

export const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

/**
 * Solve `dst = H * src` for four or more correspondences.
 *
 * Each correspondence contributes two rows to a linear system in the eight
 * unknowns. With exactly four points the system is square; with more it is
 * over-determined and solved in the least-squares sense via the normal
 * equations, which is what lets a fifth marker improve a fit rather than be
 * ignored. Returns null when the points are degenerate (collinear, coincident)
 * and the system cannot be solved.
 */
export function solveHomography(
    src: readonly Point[],
    dst: readonly Point[]
): Matrix3 | null {
    if (src.length < 4 || src.length !== dst.length) return null

    const rows: number[][] = []
    const rhs: number[] = []

    for (let i = 0; i < src.length; i++) {
        const { x, y } = src[i]
        const { x: u, y: v } = dst[i]
        rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
        rhs.push(u)
        rows.push([0, 0, 0, x, y, 1, -v * x, -v * y])
        rhs.push(v)
    }

    const solution =
        rows.length === 8
            ? solveLinear(rows, rhs)
            : solveNormalEquations(rows, rhs)
    if (!solution) return null

    return [
        solution[0],
        solution[1],
        solution[2],
        solution[3],
        solution[4],
        solution[5],
        solution[6],
        solution[7],
        1
    ]
}

/** Gaussian elimination with partial pivoting on a square system. */
function solveLinear(a: number[][], b: number[]): number[] | null {
    const n = b.length
    const m = a.map((row, i) => [...row, b[i]])

    for (let col = 0; col < n; col++) {
        let pivot = col
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
        }
        if (Math.abs(m[pivot][col]) < 1e-12) return null
        ;[m[col], m[pivot]] = [m[pivot], m[col]]

        const p = m[col][col]
        for (let r = 0; r < n; r++) {
            if (r === col) continue
            const factor = m[r][col] / p
            if (factor === 0) continue
            for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c]
        }
    }

    const out = new Array<number>(n)
    for (let i = 0; i < n; i++) {
        out[i] = m[i][n] / m[i][i]
        if (!Number.isFinite(out[i])) return null
    }
    return out
}

/** Least squares for an over-determined system: solve (AᵀA)x = Aᵀb. */
function solveNormalEquations(a: number[][], b: number[]): number[] | null {
    const n = a[0].length
    const ata: number[][] = Array.from({ length: n }, () =>
        new Array<number>(n).fill(0)
    )
    const atb = new Array<number>(n).fill(0)

    for (let r = 0; r < a.length; r++) {
        const row = a[r]
        for (let i = 0; i < n; i++) {
            atb[i] += row[i] * b[r]
            for (let j = 0; j < n; j++) ata[i][j] += row[i] * row[j]
        }
    }
    return solveLinear(ata, atb)
}

/** Project a point through the homography. */
export function applyH(h: Matrix3, p: Point): Point {
    const w = h[6] * p.x + h[7] * p.y + h[8]
    if (Math.abs(w) < 1e-12) return { x: Number.NaN, y: Number.NaN }
    return {
        x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
        y: (h[3] * p.x + h[4] * p.y + h[5]) / w
    }
}

/** The inverse map, for going from photo pixels back to page points. */
export function invertH(h: Matrix3): Matrix3 | null {
    const [a, b, c, d, e, f, g, i, j] = h
    const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g)
    if (Math.abs(det) < 1e-12) return null

    const inv = [
        (e * j - f * i) / det,
        (c * i - b * j) / det,
        (b * f - c * e) / det,
        (f * g - d * j) / det,
        (a * j - c * g) / det,
        (c * d - a * f) / det,
        (d * i - e * g) / det,
        (b * g - a * i) / det,
        (a * e - b * d) / det
    ]
    // Normalise so the bottom-right entry is 1, matching solveHomography.
    const k = inv[8]
    if (Math.abs(k) < 1e-12) return null
    return inv.map((v) => v / k) as unknown as Matrix3
}

/**
 * Root-mean-square distance, in destination units, between where the
 * homography sends each source point and where it should have landed. This is
 * the number that says whether a fit is trustworthy.
 */
export function reprojectionRms(
    h: Matrix3,
    src: readonly Point[],
    dst: readonly Point[]
): number {
    if (src.length === 0) return Number.POSITIVE_INFINITY
    let total = 0
    for (let i = 0; i < src.length; i++) {
        const p = applyH(h, src[i])
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            return Number.POSITIVE_INFINITY
        }
        total += (p.x - dst[i].x) ** 2 + (p.y - dst[i].y) ** 2
    }
    return Math.sqrt(total / src.length)
}

/** The four corners of an axis-aligned rect, clockwise from bottom-left. */
export function rectCorners(rect: {
    x: number
    y: number
    w: number
    h: number
}): [Point, Point, Point, Point] {
    return [
        { x: rect.x, y: rect.y },
        { x: rect.x, y: rect.y + rect.h },
        { x: rect.x + rect.w, y: rect.y + rect.h },
        { x: rect.x + rect.w, y: rect.y }
    ]
}
