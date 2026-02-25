import "server-only"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const R2_REGION = "auto"
const UPLOAD_TTL_SECONDS = 60

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
}

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
}): Promise<string> {
    const bucket = getR2Bucket()

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        ContentType: params.contentType,
        CacheControl: "no-cache"
    })

    return getSignedUrl(getR2Client(), command, {
        expiresIn: UPLOAD_TTL_SECONDS
    })
}
