/**
 * png.ts — write an 8-bit grayscale PNG.
 *
 * The crops are tiny and only ever grayscale, so a dependency would be a lot
 * of surface for forty lines of work. `node:zlib` supplies the only hard part.
 */

import { deflateSync } from "node:zlib"

import type { RasterImage } from "./image"

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const CRC_TABLE = (() => {
    const table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        table[n] = c
    }
    return table
})()

function crc32(buf: Buffer): number {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    }
    return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length, 0)
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([length, body, crc])
}

export function encodeGrayPng(img: RasterImage): Uint8Array {
    const header = Buffer.alloc(13)
    header.writeUInt32BE(img.width, 0)
    header.writeUInt32BE(img.height, 4)
    header[8] = 8 // bit depth
    header[9] = 0 // colour type: grayscale
    header[10] = 0 // deflate
    header[11] = 0 // adaptive filtering
    header[12] = 0 // no interlace

    // Each scanline is prefixed with its filter type; 0 means "none", which
    // compresses perfectly well for images this small.
    const raw = Buffer.alloc((img.width + 1) * img.height)
    for (let y = 0; y < img.height; y++) {
        raw[y * (img.width + 1)] = 0
        raw.set(
            img.gray.subarray(y * img.width, (y + 1) * img.width),
            y * (img.width + 1) + 1
        )
    }

    return new Uint8Array(
        Buffer.concat([
            SIGNATURE,
            chunk("IHDR", header),
            chunk("IDAT", deflateSync(raw)),
            chunk("IEND", Buffer.alloc(0))
        ])
    )
}
