/**
 * distort.ts — turn a clean synthetic sheet into something resembling a photo
 * taken in a gym. Test-only, and deterministic given a seed so a failure is
 * always reproducible.
 */

import { encode as encodeJpeg } from "jpeg-js"

import { applyH, invertH, type Point, solveHomography } from "../homography"
import { type RasterImage, sampleBilinear } from "../image"

/** Small deterministic PRNG; Math.random would make failures unrepeatable. */
function seededRandom(seed: number): () => number {
    let state = (seed * 2654435761) >>> 0
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0
        return state / 0x100000000
    }
}

interface DistortOptions {
    seed: number
    /** Corner displacement as a fraction of the image's size. */
    perspective?: number
    rotationDeg?: number
    blurSigma?: number
    noiseSigma?: number
    /** Peak darkening of the illumination gradient, 0..1. */
    shading?: number
    /** Output size relative to the input. */
    resample?: number
    /** Pad around the page, as a fraction, so it is not flush to the edge. */
    margin?: number
    /**
     * Bend the page as if it were folded in half and photographed resting on
     * a lap: the corners stay put and the middle sinks away from the camera,
     * so content there lands closer to the centre than a flat page would put
     * it. The value is the largest displacement, as a fraction of the page's
     * size; 0.035 is about the 20-30pt seen on the first folded photographs.
     */
    curl?: number
}

/**
 * For a point where a flat page would be, the point of the clean page that a
 * curled one actually shows there. Zero at all four corners and pointing
 * outward, because the middle of the page sinks away from the camera and so
 * shows more of the page in less of the frame.
 *
 * Shaped like the folded photographs. The crease runs across the page, so each
 * horizontal line is pinched evenly towards the centre, hardest at the crease
 * (`1 - |2v - 1|`): paper does not stretch along a line that stays straight.
 * The sag down the page is strongest a quarter of the way in from top and
 * bottom and a little weaker towards the side edges, which is what slopes the
 * rows.
 */
function curlOffset(p: Point, width: number, height: number, amount: number) {
    const u = p.x / width
    const v = p.y / height
    const crease = 1 - Math.abs(2 * v - 1)
    return {
        x: amount * width * (2 * u - 1) * crease,
        y:
            -amount *
            height *
            Math.sin(2 * Math.PI * v) *
            (0.5 + 0.5 * Math.sin(Math.PI * u))
    }
}

/**
 * Re-project the image into a quad. Returns both the new image and the
 * homography from the ORIGINAL pixel space into the new one, so a test can
 * compute exactly where any feature should have landed.
 */
export function distort(
    img: RasterImage,
    opts: DistortOptions
): {
    image: RasterImage
    /** Where a pixel of the clean sheet ended up in the photo. */
    truthPoint: (clean: Point) => Point
} {
    const rand = seededRandom(opts.seed)
    const margin = opts.margin ?? 0.08
    const outW = Math.round(img.width * (1 + margin * 2) * (opts.resample ?? 1))
    const outH = Math.round(
        img.height * (1 + margin * 2) * (opts.resample ?? 1)
    )

    const padX = outW * (margin / (1 + margin * 2))
    const padY = outH * (margin / (1 + margin * 2))
    const innerW = outW - padX * 2
    const innerH = outH - padY * 2

    const jitter = (opts.perspective ?? 0) * Math.min(innerW, innerH)
    const j = () => (jitter === 0 ? 0 : (rand() - 0.5) * 2 * jitter)

    let quad = [
        { x: padX + j(), y: padY + j() },
        { x: padX + innerW + j(), y: padY + j() },
        { x: padX + innerW + j(), y: padY + innerH + j() },
        { x: padX + j(), y: padY + innerH + j() }
    ]

    if (opts.rotationDeg) {
        const a = (opts.rotationDeg * Math.PI) / 180
        const cx = outW / 2
        const cy = outH / 2
        quad = quad.map((p) => ({
            x: cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a),
            y: cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a)
        }))
    }

    // Source corners in the clean image, in the same order as the quad.
    const src = [
        { x: 0, y: 0 },
        { x: img.width, y: 0 },
        { x: img.width, y: img.height },
        { x: 0, y: img.height }
    ]
    const forward = solveHomography(src, quad)
    if (!forward) throw new Error("degenerate distortion quad")
    const backward = invertH(forward)
    if (!backward) throw new Error("non-invertible distortion")

    const curl = opts.curl ?? 0
    // Flat position -> the clean point a curled page shows there.
    const bend = (q: Point): Point => {
        if (curl === 0) return q
        const d = curlOffset(q, img.width, img.height, curl)
        return { x: q.x + d.x, y: q.y + d.y }
    }
    // Its inverse, by fixed-point iteration: the offset is small and smooth,
    // so this converges in a handful of steps.
    const unbend = (p: Point): Point => {
        if (curl === 0) return p
        let q = p
        for (let i = 0; i < 30; i++) {
            const d = curlOffset(q, img.width, img.height, curl)
            q = { x: p.x - d.x, y: p.y - d.y }
        }
        return q
    }

    const gray = new Uint8Array(outW * outH).fill(255)
    for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
            const p = bend(applyH(backward, { x: x + 0.5, y: y + 0.5 }))
            if (
                !Number.isFinite(p.x) ||
                p.x < 0 ||
                p.y < 0 ||
                p.x >= img.width ||
                p.y >= img.height
            ) {
                // Outside the page: mid-grey, like a floor or a table
                gray[y * outW + x] = 170
                continue
            }
            gray[y * outW + x] = sampleBilinear(img, p.x, p.y)
        }
    }

    let out: RasterImage = { width: outW, height: outH, gray }
    if (opts.shading) out = shade(out, opts.shading, rand)
    if (opts.blurSigma) out = blur(out, opts.blurSigma)
    if (opts.noiseSigma) out = addNoise(out, opts.noiseSigma, rand)

    return {
        image: out,
        truthPoint: (clean) => applyH(forward, unbend(clean))
    }
}

/** A soft off-centre darkening, the shape overhead gym lighting makes. */
export function shade(
    img: RasterImage,
    strength: number,
    rand: () => number
): RasterImage {
    const cx = img.width * (0.3 + rand() * 0.4)
    const cy = img.height * (0.3 + rand() * 0.4)
    const radius = Math.hypot(img.width, img.height) * 0.7
    const gray = new Uint8Array(img.gray.length)
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const d = Math.hypot(x - cx, y - cy) / radius
            const factor = 1 - strength * Math.min(1, d) ** 2
            gray[y * img.width + x] = Math.max(
                0,
                Math.min(255, img.gray[y * img.width + x] * factor)
            )
        }
    }
    return { width: img.width, height: img.height, gray }
}

/** Separable box blur run three times, which approximates a Gaussian. */
export function blur(img: RasterImage, sigma: number): RasterImage {
    const radius = Math.max(1, Math.round(sigma))
    let current = img
    for (let pass = 0; pass < 3; pass++) {
        current = boxBlurPass(current, radius, true)
        current = boxBlurPass(current, radius, false)
    }
    return current
}

function boxBlurPass(
    img: RasterImage,
    radius: number,
    horizontal: boolean
): RasterImage {
    const gray = new Uint8Array(img.gray.length)
    const outer = horizontal ? img.height : img.width
    const inner = horizontal ? img.width : img.height
    for (let o = 0; o < outer; o++) {
        for (let i = 0; i < inner; i++) {
            let sum = 0
            let n = 0
            for (let k = -radius; k <= radius; k++) {
                const ii = i + k
                if (ii < 0 || ii >= inner) continue
                const idx = horizontal ? o * img.width + ii : ii * img.width + o
                sum += img.gray[idx]
                n++
            }
            const idx = horizontal ? o * img.width + i : i * img.width + o
            gray[idx] = sum / n
        }
    }
    return { width: img.width, height: img.height, gray }
}

function addNoise(
    img: RasterImage,
    sigma: number,
    rand: () => number
): RasterImage {
    const gray = new Uint8Array(img.gray.length)
    for (let i = 0; i < img.gray.length; i++) {
        // Box-Muller would be more correct; the sum of two uniforms is enough
        const n = (rand() + rand() - 1) * sigma * 2
        gray[i] = Math.max(0, Math.min(255, img.gray[i] + n))
    }
    return { width: img.width, height: img.height, gray }
}

/**
 * Encode as a real JPEG, which is what an upload actually is. Using this in
 * tests means the production decode path runs for real and the synthetic
 * photos carry genuine compression artefacts rather than an idealised signal.
 */
export function toJpeg(img: RasterImage, quality = 82): Uint8Array {
    const rgba = Buffer.alloc(img.width * img.height * 4)
    for (let i = 0, p = 0; i < img.gray.length; i++, p += 4) {
        const v = img.gray[i]
        rgba[p] = v
        rgba[p + 1] = v
        rgba[p + 2] = v
        rgba[p + 3] = 255
    }
    return new Uint8Array(
        encodeJpeg(
            { data: rgba, width: img.width, height: img.height },
            quality
        ).data
    )
}
