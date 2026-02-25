export interface CompressImageOptions {
    maxDimension?: number
    targetMaxBytes?: number
    initialQuality?: number
    minQuality?: number
    qualityStep?: number
    minDimension?: number
}

export interface CompressedImageResult {
    blob: Blob
    width: number
    height: number
}

const defaultOptions: Required<CompressImageOptions> = {
    maxDimension: 1280,
    targetMaxBytes: 1_100_000,
    initialQuality: 0.82,
    minQuality: 0.55,
    qualityStep: 0.08,
    minDimension: 700
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
    const objectUrl = URL.createObjectURL(file)

    return await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()

        image.onload = () => {
            URL.revokeObjectURL(objectUrl)
            resolve(image)
        }

        image.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            reject(new Error("Failed to decode selected image."))
        }

        image.src = objectUrl
    })
}

async function canvasToJpegBlob(
    canvas: HTMLCanvasElement,
    quality: number
): Promise<Blob> {
    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality)
    })

    if (!blob) {
        throw new Error("Failed to encode image.")
    }

    return blob
}

export async function compressImageForUpload(
    file: File,
    options?: CompressImageOptions
): Promise<CompressedImageResult> {
    const opts = { ...defaultOptions, ...options }

    if (!file.type.startsWith("image/")) {
        throw new Error("Only image files are supported.")
    }

    const image = await loadImage(file)
    const originalWidth = image.naturalWidth || image.width
    const originalHeight = image.naturalHeight || image.height

    if (!originalWidth || !originalHeight) {
        throw new Error("Invalid image dimensions.")
    }

    let maxDimension = Math.min(
        opts.maxDimension,
        Math.max(originalWidth, originalHeight)
    )
    let bestBlob: Blob | null = null
    let bestWidth = originalWidth
    let bestHeight = originalHeight

    for (let attempt = 0; attempt < 6; attempt += 1) {
        const scale = Math.min(
            1,
            maxDimension / Math.max(originalWidth, originalHeight)
        )
        const width = Math.max(1, Math.round(originalWidth * scale))
        const height = Math.max(1, Math.round(originalHeight * scale))

        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext("2d")
        if (!context) {
            throw new Error("Could not initialize image processing.")
        }

        context.drawImage(image, 0, 0, width, height)

        let quality = opts.initialQuality
        let attemptBestBlob = await canvasToJpegBlob(canvas, quality)

        while (
            attemptBestBlob.size > opts.targetMaxBytes &&
            quality > opts.minQuality
        ) {
            quality = Math.max(opts.minQuality, quality - opts.qualityStep)
            const lowerQualityBlob = await canvasToJpegBlob(canvas, quality)
            if (lowerQualityBlob.size <= attemptBestBlob.size) {
                attemptBestBlob = lowerQualityBlob
            }
        }

        if (!bestBlob || attemptBestBlob.size < bestBlob.size) {
            bestBlob = attemptBestBlob
            bestWidth = width
            bestHeight = height
        }

        if (attemptBestBlob.size <= opts.targetMaxBytes) {
            return {
                blob: attemptBestBlob,
                width,
                height
            }
        }

        const reducedMaxDimension = Math.round(maxDimension * 0.85)
        if (reducedMaxDimension < opts.minDimension) {
            break
        }

        maxDimension = reducedMaxDimension
    }

    if (!bestBlob) {
        throw new Error("Failed to prepare image for upload.")
    }

    return {
        blob: bestBlob,
        width: bestWidth,
        height: bestHeight
    }
}
