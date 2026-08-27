import "server-only"
import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { requireEnv } from "@/lib/utils"

const R2_REGION = "auto"
const UPLOAD_TTL_SECONDS = 60
// 10 MB — comfortable ceiling for a player headshot JPEG; adjust per-feature
// via the `maxContentLength` param if needed.
export const PLAYER_PICTURE_MAX_BYTES = 10 * 1024 * 1024

function getR2AccountId(): string {
    return requireEnv("R2_ACCOUNT_ID")
}

function getR2AccessKeyId(): string {
    return requireEnv("R2_ACCESS_KEY_ID")
}

function getR2SecretAccessKey(): string {
    return requireEnv("R2_SECRET_ACCESS_KEY")
}

function getR2Bucket(): string {
    return requireEnv("R2_BUCKET")
}

let cachedClient: S3Client | null = null

function getR2Client(): S3Client {
    if (cachedClient) {
        return cachedClient
    }

    const accountId = getR2AccountId()
    const accessKeyId = getR2AccessKeyId()
    const secretAccessKey = getR2SecretAccessKey()

    cachedClient = new S3Client({
        region: R2_REGION,
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId,
            secretAccessKey
        }
    })

    return cachedClient
}

export async function createPlayerPictureUploadPresignedUrl(params: {
    key: string
    contentType: string
    contentLength: number
    maxContentLength?: number
}): Promise<string> {
    const bucket = getR2Bucket()

    const max = params.maxContentLength ?? PLAYER_PICTURE_MAX_BYTES
    if (
        !Number.isFinite(params.contentLength) ||
        params.contentLength <= 0 ||
        !Number.isInteger(params.contentLength)
    ) {
        throw new Error("contentLength must be a positive integer")
    }
    if (params.contentLength > max) {
        throw new Error(
            `Upload too large: ${params.contentLength} bytes (max ${max})`
        )
    }

    // Signing ContentLength binds the upload to this exact size. The client
    // must send a matching Content-Length header or R2 will reject the
    // signature — this prevents oversized uploads via the presigned URL.
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        ContentType: params.contentType,
        ContentLength: params.contentLength,
        CacheControl: "no-cache"
    })

    return getSignedUrl(getR2Client(), command, {
        expiresIn: UPLOAD_TTL_SECONDS
    })
}

export async function deleteR2Object(key: string): Promise<void> {
    const bucket = getR2Bucket()

    const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
    })

    await getR2Client().send(command)
}

/**
 * Server-side upload. Used for bytes the app already holds (e.g. inbound
 * email attachments decoded from a webhook) as opposed to the presigned flow
 * where the browser uploads directly.
 */
export async function putR2Object(params: {
    key: string
    body: Buffer
    contentType: string
}): Promise<void> {
    const command = new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        ContentLength: params.body.length
    })

    await getR2Client().send(command)
}

export interface R2ObjectStream {
    body: ReadableStream
    contentType: string | null
    contentLength: number | null
}

/** Fetch an object as a web stream, or null when the key doesn't exist. */
export async function getR2Object(key: string): Promise<R2ObjectStream | null> {
    const command = new GetObjectCommand({ Bucket: getR2Bucket(), Key: key })

    try {
        const result = await getR2Client().send(command)
        if (!result.Body) return null
        return {
            body: result.Body.transformToWebStream(),
            contentType: result.ContentType ?? null,
            contentLength: result.ContentLength ?? null
        }
    } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") return null
        throw error
    }
}
