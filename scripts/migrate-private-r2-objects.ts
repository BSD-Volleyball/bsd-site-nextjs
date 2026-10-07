#!/usr/bin/env tsx
// Copies the private prefixes from the public R2 bucket to the private one
// and, on a second explicit run with --delete, removes the originals.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/migrate-private-r2-objects.ts
//   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/migrate-private-r2-objects.ts --delete
//
// Idempotent: an object already present in the private bucket with the same
// size and ETag is skipped. --delete refuses to remove anything unless every
// object under the prefixes verifies, so a partial copy can never strand a
// file. Also lists email_attachments rows whose key is absent from the
// private bucket, since those are the only private objects the app reads
// back by key.
import "dotenv/config"
import {
    CopyObjectCommand,
    DeleteObjectCommand,
    HeadBucketCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    S3Client
} from "@aws-sdk/client-s3"
import { db } from "../src/database/db"
import { emailAttachments } from "../src/database/schema"

const PREFIXES = ["email-attachments/", "inbound-spool/", "scoresheet-samples/"]

function env(name: string): string {
    const value = process.env[name]
    if (!value) throw new Error(`Missing ${name}`)
    return value
}

const PUBLIC_BUCKET = env("R2_BUCKET")
const PRIVATE_BUCKET = env("R2_PRIVATE_BUCKET")
const DELETE = process.argv.includes("--delete")

const client = new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY")
    }
})

interface Obj {
    key: string
    size: number
    etag: string
}

async function list(bucket: string, prefix: string): Promise<Obj[]> {
    const out: Obj[] = []
    let token: string | undefined
    do {
        const page = await client.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                ContinuationToken: token
            })
        )
        for (const o of page.Contents ?? []) {
            if (o.Key) {
                out.push({ key: o.Key, size: o.Size ?? 0, etag: o.ETag ?? "" })
            }
        }
        token = page.NextContinuationToken
    } while (token)
    return out
}

async function head(bucket: string, key: string): Promise<Obj | null> {
    try {
        const r = await client.send(
            new HeadObjectCommand({ Bucket: bucket, Key: key })
        )
        return { key, size: r.ContentLength ?? 0, etag: r.ETag ?? "" }
    } catch (error) {
        const name = (error as { name?: string }).name
        if (name === "NotFound" || name === "NoSuchKey") return null
        throw error
    }
}

function same(a: Obj, b: Obj): boolean {
    return a.size === b.size && a.etag === b.etag
}

async function main() {
    if (PUBLIC_BUCKET === PRIVATE_BUCKET) {
        throw new Error("R2_PRIVATE_BUCKET must differ from R2_BUCKET")
    }
    await client.send(new HeadBucketCommand({ Bucket: PRIVATE_BUCKET }))
    console.log(`token can reach ${PRIVATE_BUCKET}`)

    let copied = 0
    let skipped = 0
    const failed: string[] = []
    // Keys whose private copy matched in this run: the only ones --delete
    // may remove, so an object that lands after the check is never touched.
    const verified: string[] = []

    for (const prefix of PREFIXES) {
        const source = await list(PUBLIC_BUCKET, prefix)
        console.log(`${prefix} ${source.length} object(s) in ${PUBLIC_BUCKET}`)
        for (const obj of source) {
            const existing = await head(PRIVATE_BUCKET, obj.key)
            if (existing && same(existing, obj)) {
                skipped++
                verified.push(obj.key)
                continue
            }
            if (DELETE) {
                // --delete never copies; a missing copy is a reason to stop.
                failed.push(obj.key)
                continue
            }
            await client.send(
                new CopyObjectCommand({
                    Bucket: PRIVATE_BUCKET,
                    Key: obj.key,
                    CopySource: `/${PUBLIC_BUCKET}/${encodeURIComponent(obj.key).replace(/%2F/g, "/")}`,
                    MetadataDirective: "COPY"
                })
            )
            const after = await head(PRIVATE_BUCKET, obj.key)
            if (after && same(after, obj)) copied++
            else failed.push(obj.key)
        }
    }
    console.log(
        `copied ${copied}, already present ${skipped}, failed ${failed.length}`
    )
    for (const key of failed) console.log(`  FAILED ${key}`)

    const rows = await db
        .select({ key: emailAttachments.r2_key })
        .from(emailAttachments)
    const orphans: string[] = []
    for (const row of rows) {
        if (!(await head(PRIVATE_BUCKET, row.key))) orphans.push(row.key)
    }
    console.log(
        `${rows.length} email_attachments row(s); ${orphans.length} without an object in ${PRIVATE_BUCKET}`
    )
    for (const key of orphans) console.log(`  ORPHAN ${key}`)

    if (failed.length > 0 || orphans.length > 0) {
        process.exitCode = 1
        if (DELETE) console.log("refusing to delete: unverified objects above")
        return
    }

    if (!DELETE) return
    let deleted = 0
    for (const key of verified) {
        await client.send(
            new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: key })
        )
        deleted++
    }
    console.log(`deleted ${deleted} object(s) from ${PUBLIC_BUCKET}`)
    for (const prefix of PREFIXES) {
        const left = await list(PUBLIC_BUCKET, prefix)
        console.log(`${prefix} ${left.length} left in ${PUBLIC_BUCKET}`)
        if (left.length > 0) process.exitCode = 1
    }
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => process.exit())
