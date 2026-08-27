import "dotenv/config"
import { readFile } from "node:fs/promises"
import { basename, extname } from "node:path"
import { and, eq } from "drizzle-orm"
import { db } from "../src/database/db"
import {
    type AttachmentParentType,
    emailAttachments
} from "../src/database/schema"
import {
    buildAttachmentKey,
    sanitizeFilename
} from "../src/lib/email-attachments"
import { putR2Object } from "../src/lib/r2"

// Manually attach files to an inbound message that already exists — for
// emails that arrived before attachment capture existed (Postmark's API does
// not expose attachment bytes for processed inbound messages, so the files
// have to be downloaded from the Postmark Activity UI or a mailbox copy).
//
// Usage:
//   NODE_OPTIONS='--conditions=react-server' DOTENV_CONFIG_PATH=.env.local \
//     npx tsx scripts/attach-files-to-message.mts <parentType> <parentId> <file>... [--dry-run]
//
// parentType: email | email_received | concern | concern_received
// Files are keyed under email-attachments/manual-<parentType>-<parentId>/ and
// a file whose sanitised name already exists on that message is skipped, so
// re-running is safe.

const MIME_BY_EXT: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip"
}

const PARENT_TYPES: AttachmentParentType[] = [
    "email",
    "email_received",
    "concern",
    "concern_received"
]

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const [parentTypeArg, parentIdArg, ...files] = args.filter(
    (a) => a !== "--dry-run"
)

const parentType = parentTypeArg as AttachmentParentType
const parentId = Number(parentIdArg)
if (
    !PARENT_TYPES.includes(parentType) ||
    !Number.isInteger(parentId) ||
    parentId <= 0 ||
    files.length === 0
) {
    console.error(
        "usage: attach-files-to-message.mts <parentType> <parentId> <file>... [--dry-run]"
    )
    process.exit(1)
}

const existing = await db
    .select({ filename: emailAttachments.filename })
    .from(emailAttachments)
    .where(
        and(
            eq(emailAttachments.parent_type, parentType),
            eq(emailAttachments.parent_id, parentId)
        )
    )
const existingNames = new Set(existing.map((r) => r.filename))
const keyPrefix = `manual-${parentType}-${parentId}`

for (const [index, file] of files.entries()) {
    const original = basename(file)
    const filename = sanitizeFilename(original, `attachment-${index + 1}`)
    if (existingNames.has(filename)) {
        console.log(`skip   ${filename} (already attached)`)
        continue
    }

    const body = await readFile(file)
    const contentType =
        MIME_BY_EXT[extname(original).toLowerCase()] ??
        "application/octet-stream"
    const key = buildAttachmentKey(keyPrefix, existing.length + index, filename)

    if (dryRun) {
        console.log(
            `would  ${filename} (${contentType}, ${body.length} bytes) -> ${key}`
        )
        continue
    }

    await putR2Object({ key, body, contentType })
    const [row] = await db
        .insert(emailAttachments)
        .values({
            parent_type: parentType,
            parent_id: parentId,
            filename,
            content_type: contentType,
            size_bytes: body.length,
            r2_key: key,
            content_id: null
        })
        .returning({ id: emailAttachments.id })
    console.log(
        `stored ${filename} (${contentType}, ${body.length} bytes) as attachment #${row.id}`
    )
}

process.exit(0)
