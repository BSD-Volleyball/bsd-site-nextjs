/**
 * capture.ts — how a photographed score sheet must be captured to stay
 * readable. Deliberately free of imports so the browser can use it.
 *
 * A letter page is 792pt on its long edge, so an upload capped at N pixels
 * gives N/792 pixels per point:
 *
 *   maxDimension | px/pt | FINAL box (13pt) | checkbox (7.5pt) | QR module
 *   1280 (old)   | 1.62  | 21px             | 12px             | 3.6px
 *   3000         | 3.79  | 49px             | 28px             | 8.5px
 *
 * The old default left a QR module at 3.6px, which is the decoder's floor
 * before any blur, and a digit box too small to read reliably. Perspective
 * foreshortening on the far edge of a hand-held photo costs another 30-40%
 * on top, which is why this is 3000 rather than something merely adequate
 * head-on. It stays far below the 10MB presigned-upload cap, and the upload
 * goes from the browser straight to storage so no request-body limit applies.
 *
 * Player pictures keep the smaller default; only score sheets need this.
 */
export const SCORE_SHEET_COMPRESSION = {
    maxDimension: 3000,
    targetMaxBytes: 3_500_000,
    minDimension: 2200
} as const
