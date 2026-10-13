/**
 * tag-photo.ts — a JPEG "photo" carrying a sheet's QR tag, for tests.
 *
 * The readers are faked in tests, so nothing needs handwriting; the one thing
 * decoded from pixels is the QR. This draws just that, on white paper, at
 * roughly the scale a real photo gives it (a module about 7px across), and
 * encodes it the way the browser uploads it.
 */

import { encode } from "jpeg-js"
import QRCode from "qrcode"

export function tagPhoto(
    tag: string | null,
    opts: { width?: number; height?: number; module?: number } = {}
): Uint8Array {
    const width = opts.width ?? 900
    const height = opts.height ?? 1200
    const module = opts.module ?? 7
    const rgba = new Uint8Array(width * height * 4).fill(255)

    if (tag) {
        const qr = QRCode.create(tag, { errorCorrectionLevel: "M" })
        const size = qr.modules.size
        // Bottom-right, as printed, with a quiet zone of white around it.
        const left = width - (size + 8) * module
        const top = height - (size + 8) * module
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (!qr.modules.data[r * size + c]) continue
                for (let y = 0; y < module; y++) {
                    for (let x = 0; x < module; x++) {
                        const p =
                            ((top + r * module + y) * width +
                                (left + c * module + x)) *
                            4
                        rgba[p] = rgba[p + 1] = rgba[p + 2] = 0
                    }
                }
            }
        }
    }

    return new Uint8Array(encode({ data: rgba, width, height }, 90).data)
}
