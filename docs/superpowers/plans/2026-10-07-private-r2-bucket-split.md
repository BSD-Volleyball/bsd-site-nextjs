# Private R2 Bucket Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the three private object prefixes (`email-attachments/`, `inbound-spool/`, `scoresheet-samples/`) out of the public `bsd` bucket into a new bucket with no public domain, and roll the pics-guard Worker back to the prefix-routed version that is already deployed, so the catch-all Worker never ships.

**Architecture:** `src/lib/r2.ts` gains a bucket *scope* (`public` | `private`); the three private writers and the attachment presigner use `private`, everything else is unchanged. The spool reader checks the private bucket first and falls back to the public one only during the cut-over window between the app deploy and the inbound Worker redeploy. A one-off script copies existing objects, verifies them, and (on a second, explicit run) deletes the originals. The pics-guard changes from the audit are reverted with `git revert`, leaving the repo equal to what is in production.

**Tech Stack:** Next.js 16, `@aws-sdk/client-s3` against R2's S3 endpoint, Cloudflare Workers + wrangler 4 (logged in: OAuth token for the account that owns `bsd`), Vercel CLI (project linked), Vitest, Biome.

**Spec:** The conversation that produced this plan: the catch-all pics-guard Worker (commit `7a64c0c`) was judged the wrong trade (a Worker invocation on every picture to guard objects that never needed a public domain); the user asked for the bucket split instead and a rollback of the Worker, which has not been deployed.

## Global Constraints

- pnpm only. Biome: 4-space indent, no semicolons, no trailing commas. `pnpm lint` last before each commit.
- `src/lib` must not import `next/*`, `@/next/*`, `@/app/*`, `@/components/*`.
- One-off scripts use `import "dotenv/config"` and run as `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/<name>.ts`. `.env.local` holds the production R2 credentials; it is gitignored and must never be committed or printed.
- Secrets are never echoed to the terminal. Bucket names are not secrets.
- Commit after each task on `main`; run `git diff --cached --stat` first (other sessions pre-stage files in this checkout). End commit messages with the attribution trailer from the session reminder.
- The production cut-over must never leave inbound email unprocessable: the app must be able to read a spool object from whichever bucket the Worker wrote it to, at every point in the sequence. The task order below is load-bearing; do not reorder Tasks 3, 4 and 5.
- Deleting objects from the public bucket (Task 5) is destructive and runs only after the copy has been verified byte-for-byte and the app has been serving from the private bucket.
- Do not deploy pics-guard. Production already runs the prefix-routed version this plan reverts to.

## Review Focus

1. **`R2_PRIVATE_BUCKET` unset in production.** The app must refuse to start writing private objects to the public bucket; it must throw, not silently fall back. Pinned by the `resolveR2Bucket` unit test ("throws in production when the private bucket is unset").
2. **A spool envelope arriving for an object the Worker wrote to the OLD bucket after the app deploy.** Must still be processed and the object deleted from the bucket it was found in. Pinned by the webhook route's `handleSpooledInbound` reading both scopes (Task 1 Step 7) and the manual smoke test in Task 4.
3. **An attachment row whose object was not copied.** The download route presigns against the private bucket; a missing object is a 404 from R2, not a crash. The copy script's verify pass (Task 2) lists any attachment row whose key is absent from the private bucket, and Task 5 refuses to delete while that list is non-empty.
4. **The S3 token is scoped to the `bsd` bucket only.** `HeadBucket` on the new bucket fails with 403 and nothing else in the plan works. Task 2 Step 3 checks this first and stops with instructions if so.
5. **Percent-encoded requests on the picture host after the rollback.** The deployed Worker still 404s the three private prefixes on their literal routes; the encoded form reaches R2, where those prefixes are now empty. Nothing to pin in code; Task 6 updates the AGENTS.md note so the next reader knows why that is acceptable.

---

### Task 1: Bucket scope in `src/lib/r2.ts` and the private call sites

**Files:**
- Modify: `src/lib/r2.ts`
- Create: `src/lib/r2-bucket.ts` (pure resolver, unit-testable)
- Create: `src/lib/r2-bucket.test.ts`
- Modify: `src/lib/email-attachments.ts` (put → private)
- Modify: `src/lib/scoresheets/read/samples.ts` (put → private)
- Modify: `src/app/api/webhooks/postmark/route.ts` (spool get/delete: private, then public)
- Modify: `AGENTS.md` (env var list)

**Interfaces:**
- Produces: `export type R2Scope = "public" | "private"` and `export function resolveR2Bucket(scope: R2Scope, env: { R2_BUCKET?: string; R2_PRIVATE_BUCKET?: string; NODE_ENV?: string }): string` in `src/lib/r2-bucket.ts`.
- Produces: `putR2Object({ key, body, contentType, scope? })`, `getR2Object(key, scope?)`, `deleteR2Object(key, scope?)` in `src/lib/r2.ts`, `scope` defaulting to `"public"`. `createAttachmentDownloadPresignedUrl` always uses `"private"`.

- [ ] **Step 1: Write the failing unit test**

Create `src/lib/r2-bucket.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { resolveR2Bucket } from "./r2-bucket"

describe("resolveR2Bucket", () => {
    const env = { R2_BUCKET: "bsd", R2_PRIVATE_BUCKET: "bsd-private" }

    it("returns the public bucket for public objects", () => {
        expect(resolveR2Bucket("public", env)).toBe("bsd")
    })

    it("returns the private bucket for private objects", () => {
        expect(resolveR2Bucket("private", env)).toBe("bsd-private")
    })

    it("falls back to the public bucket outside production so dev and CI need no extra var", () => {
        expect(
            resolveR2Bucket("private", { R2_BUCKET: "bsd", NODE_ENV: "test" })
        ).toBe("bsd")
    })

    it("throws in production when the private bucket is unset", () => {
        // Falling back would put email attachments on the public domain.
        expect(() =>
            resolveR2Bucket("private", {
                R2_BUCKET: "bsd",
                NODE_ENV: "production"
            })
        ).toThrow("R2_PRIVATE_BUCKET")
    })

    it("throws when the public bucket is unset", () => {
        expect(() => resolveR2Bucket("public", {})).toThrow("R2_BUCKET")
    })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/r2-bucket.test.ts`
Expected: FAIL, cannot resolve `./r2-bucket`.

- [ ] **Step 3: Create `src/lib/r2-bucket.ts`**

```ts
/**
 * Which R2 bucket an object lives in.
 *
 * `public`: the `bsd` bucket behind pics.bumpsetdrink.com — player, team and
 * score-sheet photos, sponsor logos. Everything in it is downloadable by key.
 * `private`: a bucket with no public domain — inbound email attachments, the
 * inbound-mail spool, the score-sheet handwriting corpus. The app reads
 * these only through the S3 API (and hands staff 60-second presigned URLs),
 * so they never needed a public domain; keeping them in the public bucket
 * meant a deny-list Worker in front of it, which the 2026-10 audit bypassed
 * with a percent-encoded slash.
 */
export type R2Scope = "public" | "private"

export function resolveR2Bucket(
    scope: R2Scope,
    env: { R2_BUCKET?: string; R2_PRIVATE_BUCKET?: string; NODE_ENV?: string }
): string {
    if (scope === "private") {
        if (env.R2_PRIVATE_BUCKET) return env.R2_PRIVATE_BUCKET
        if (env.NODE_ENV === "production") {
            throw new Error(
                "Missing required environment variable: R2_PRIVATE_BUCKET"
            )
        }
        // Dev and CI run against one bucket; the split only matters where
        // the public bucket really is public.
    }
    if (!env.R2_BUCKET) {
        throw new Error("Missing required environment variable: R2_BUCKET")
    }
    return env.R2_BUCKET
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/r2-bucket.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Thread the scope through `src/lib/r2.ts`**

Replace the `getR2Bucket` function and the `requireEnv` import usage with:

```ts
import { type R2Scope, resolveR2Bucket } from "@/lib/r2-bucket"

function getR2Bucket(scope: R2Scope): string {
    return resolveR2Bucket(scope, {
        R2_BUCKET: process.env.R2_BUCKET,
        R2_PRIVATE_BUCKET: process.env.R2_PRIVATE_BUCKET,
        NODE_ENV: process.env.NODE_ENV
    })
}
```

Keep `requireEnv` imported for the account id and keys. Then:

- `createPlayerPictureUploadPresignedUrl`: `const bucket = getR2Bucket("public")` (browser uploads are only ever public pictures and sponsor logos).
- `deleteR2Object(key: string, scope: R2Scope = "public")`: `Bucket: getR2Bucket(scope)`.
- `putR2Object(params: { key: string; body: Buffer; contentType: string; scope?: R2Scope })`: `Bucket: getR2Bucket(params.scope ?? "public")`.
- `createAttachmentDownloadPresignedUrl`: `Bucket: getR2Bucket("private")` and extend its doc comment: "Attachments live in the private bucket; the presigned URL is the only way a browser ever reaches one."
- `getR2Object(key: string, scope: R2Scope = "public")`: `Bucket: getR2Bucket(scope)`.

- [ ] **Step 6: Private writers**

`src/lib/email-attachments.ts`, in `uploadOne`:

```ts
        await putR2Object({
            key: prepared.key,
            body: prepared.body,
            contentType: prepared.contentType,
            scope: "private"
        })
```

`src/lib/scoresheets/read/samples.ts`, in `storeScoreSamples`:

```ts
            await putR2Object({
                key,
                body: Buffer.from(crop.png),
                contentType: "image/png",
                scope: "private"
            })
```

- [ ] **Step 7: Spool reader checks both buckets during cut-over**

In `src/app/api/webhooks/postmark/route.ts`, `handleSpooledInbound`, replace

```ts
    const object = await getR2Object(spoolKey)
```

with

```ts
    // The inbound Worker writes the spool to the private bucket. During the
    // cut-over (app deployed, Worker not yet redeployed) an object may still
    // land in the public bucket, so look there second and delete from
    // wherever it was found. Remove the fallback once the Worker is on the
    // private bucket and the public inbound-spool/ prefix is empty.
    let scope: R2Scope = "private"
    let object = await getR2Object(spoolKey, scope)
    if (!object) {
        scope = "public"
        object = await getR2Object(spoolKey, scope)
    }
```

and the delete with `await deleteR2Object(spoolKey, scope)`. Add `import type { R2Scope } from "@/lib/r2-bucket"`.

- [ ] **Step 8: Document the variable**

In `AGENTS.md`, "Environment Notes", change the R2 line to:

```markdown
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (the public bucket behind `pics.bumpsetdrink.com`: player/team/score-sheet pictures, sponsor logos), `R2_PRIVATE_BUCKET` (no public domain: inbound email attachments, the inbound-email spool, the score-sheet sample corpus; required in production, falls back to `R2_BUCKET` elsewhere)
```

- [ ] **Step 9: Verify and commit**

Run: `pnpm check-types && pnpm vitest run src/lib/r2-bucket.test.ts src/lib/inbound && pnpm lint`

```bash
git add src/lib/r2-bucket.ts src/lib/r2-bucket.test.ts src/lib/r2.ts src/lib/email-attachments.ts src/lib/scoresheets/read/samples.ts src/app/api/webhooks/postmark/route.ts AGENTS.md
git commit -m "feat(r2): route private objects to a bucket with no public domain

Email attachments, the inbound spool and the score-sheet sample corpus
were in the same bucket as the public pictures, guarded only by a Worker
in front of the public domain. They now go to R2_PRIVATE_BUCKET (required
in production). The spool reader checks both buckets until the inbound
Worker is redeployed."
```

---

### Task 2: Create the bucket, verify token access, copy existing objects

**Files:**
- Create: `scripts/migrate-private-r2-objects.ts`
- Modify: `workers/postmark-inbound/README.md` (lifecycle command names the new bucket)

**Interfaces:**
- Produces: the script, run as `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/migrate-private-r2-objects.ts [--delete]`. Without `--delete`: copy + verify, exit 1 on any mismatch. With `--delete`: verify, then delete originals, exit 1 and delete nothing if any key is unverified.

- [ ] **Step 1: Create the bucket and its lifecycle rule**

Run from `workers/postmark-inbound` (wrangler is installed there):

```bash
pnpm --dir workers/postmark-inbound exec wrangler r2 bucket create bsd-private
pnpm --dir workers/postmark-inbound exec wrangler r2 bucket lifecycle add bsd-private --prefix inbound-spool/ --expire-days 3
pnpm --dir workers/postmark-inbound exec wrangler r2 bucket lifecycle list bsd-private
```

Expected: bucket created; lifecycle list shows `expire-inbound-spool`-style rule on `inbound-spool/` with 3 days (the Default Multipart Abort rule may also appear). Do NOT add a custom domain or enable public access on this bucket.

- [ ] **Step 2: Write the migration script**

Create `scripts/migrate-private-r2-objects.ts`:

```ts
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
            if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, etag: o.ETag ?? "" })
        }
        token = page.NextContinuationToken
    } while (token)
    return out
}

async function head(bucket: string, key: string): Promise<Obj | null> {
    try {
        const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
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

    for (const prefix of PREFIXES) {
        const source = await list(PUBLIC_BUCKET, prefix)
        console.log(`${prefix} ${source.length} object(s) in ${PUBLIC_BUCKET}`)
        for (const obj of source) {
            const existing = await head(PRIVATE_BUCKET, obj.key)
            if (existing && same(existing, obj)) {
                skipped++
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
    console.log(`copied ${copied}, already present ${skipped}, failed ${failed.length}`)
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
    for (const prefix of PREFIXES) {
        for (const obj of await list(PUBLIC_BUCKET, prefix)) {
            await client.send(
                new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: obj.key })
            )
            deleted++
        }
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
```

Note on `CopySource`: R2 expects `/<bucket>/<key>` with the key URL-encoded except for the slashes. The keys here are limited to `[A-Za-z0-9._/-]` by `buildAttachmentKey`, `samples.ts` and the Worker, so the encoding is a no-op in practice; it is there for correctness.

If `db` cannot be imported this way from `scripts/` (check how `scripts/run-migration.ts` imports the database, and copy that import style), adjust the two relative imports.

- [ ] **Step 3: Add the variable locally and check the token can reach the new bucket**

Append to `.env.local` (do not print the file):

```bash
printf '\nR2_PRIVATE_BUCKET="bsd-private"\n' >> .env.local
grep -c 'R2_PRIVATE_BUCKET' .env.local
```

Expected: `1`.

Run the script without `--delete`:

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/migrate-private-r2-objects.ts
```

Expected first line: `token can reach bsd-private`. **If this throws AccessDenied/403**, the S3 API token is scoped to the `bsd` bucket only. STOP here, do not continue to later tasks, and report: the user must create a new R2 API token in the Cloudflare dashboard (R2 → Manage API tokens → Object Read & Write, applied to both `bsd` and `bsd-private`), update `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` in `.env.local` and on Vercel, then re-run from this step.

Expected summary (as of 2026-10-07): `email-attachments/ 11 object(s)`, `inbound-spool/ 0`, `scoresheet-samples/ 0`, `copied 11, already present 0, failed 0`, `11 email_attachments row(s); 0 without an object`. Exit code 0.

Run it a second time: expected `copied 0, already present 11` (idempotence).

- [ ] **Step 4: README**

In `workers/postmark-inbound/README.md`, change the lifecycle command in step 3 and the smoke-test note in step 6 to name `bsd-private` instead of `bsd`, and change the sentence in step 1 ("R2 bucket `bsd` must exist") to "R2 bucket `bsd-private` (no public domain) must exist".

- [ ] **Step 5: Commit**

Run: `pnpm check-types && pnpm lint`

```bash
git add scripts/migrate-private-r2-objects.ts workers/postmark-inbound/README.md
git commit -m "chore(r2): script to copy private prefixes into the private bucket and retire the originals"
```

---

### Task 3: Production env var, app deploy, verify reads

- [ ] **Step 1: Add `R2_PRIVATE_BUCKET` on Vercel for every environment**

```bash
printf 'bsd-private' | vercel env add R2_PRIVATE_BUCKET production
printf 'bsd-private' | vercel env add R2_PRIVATE_BUCKET preview
printf 'bsd-private' | vercel env add R2_PRIVATE_BUCKET development
vercel env ls | grep R2_PRIVATE_BUCKET
```

Expected: one row listing Development, Preview, Production.

- [ ] **Step 2: Push and wait for the production deployment**

```bash
git push origin main
```

Then poll until the newest production deployment is Ready and built from the pushed commit:

```bash
vercel ls --prod 2>&1 | head -6
vercel api "/v13/deployments/<deployment-url-from-ls>?teamId=team_tkKBe6SDX0kHkhPoC50igly3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['readyState'], d['meta'].get('githubCommitSha'))"
```

Expected: `READY <sha of your push>`. If the build fails, read `vercel inspect --logs <url>` and fix before continuing; do not proceed to Task 4 with a broken app, because the Worker redeploy makes the private bucket the only place new spool objects land.

- [ ] **Step 3: Verify an attachment download works from the private bucket**

Find one attachment id with `DOTENV_CONFIG_PATH=.env.local npx tsx -e` is awkward (CJS); instead run a tiny script in the scratchpad that selects `id` from `email_attachments` limit 1 using the same import style as the migration script, or ask the database via the existing admin UI if signed in. Then request the staff download route with a browser session the user holds, or skip this check and rely on Step 4 below. Record which you did.

- [ ] **Step 4: Verify the app writes new private objects to the new bucket**

A real inbound email with an attachment is the end-to-end proof, but it depends on the Worker (Task 4). For now confirm the configuration only: `vercel env pull /tmp/claude-1000/-home-kasm-user-src-bsd-site-nextjs/21c0d610-1647-46cd-8c4f-8fcb6b50cf88/scratchpad/env.production --environment production` and `grep -c R2_PRIVATE_BUCKET` on that file (expected `1`), then delete the pulled file.

No commit in this task.

---

### Task 4: Inbound Worker writes the spool to the private bucket

**Files:**
- Modify: `workers/postmark-inbound/wrangler.jsonc`

- [ ] **Step 1: Change the binding**

```jsonc
    "r2_buckets": [{ "binding": "SPOOL_BUCKET", "bucket_name": "bsd-private" }],
```

Add above it:

```jsonc
    // The spool holds complete raw emails; it lives in the private bucket
    // (no public domain), not in `bsd` behind pics.bumpsetdrink.com.
```

- [ ] **Step 2: Test, type-check, deploy**

```bash
pnpm worker:install
pnpm worker:test
pnpm worker:check-types
pnpm worker:deploy
```

Expected: tests pass (they use a local R2 under the same binding name), deploy prints the Worker URL and the `hooks.bumpsetdrink.com` route.

- [ ] **Step 3: Smoke test the full path**

Send a Postmark-shaped JSON POST to the Worker with the Basic credentials from `.env.local` (`POSTMARK_WEBHOOK_USER`/`POSTMARK_WEBHOOK_PASSWORD`), without printing them:

```bash
cd /home/kasm-user/src/bsd-site-nextjs
U=$(grep -E '^POSTMARK_WEBHOOK_USER=' .env.local | cut -d= -f2- | tr -d '"')
P=$(grep -E '^POSTMARK_WEBHOOK_PASSWORD=' .env.local | cut -d= -f2- | tr -d '"')
curl -s -o /dev/null -w '%{http_code}\n' -u "$U:$P" -H 'content-type: application/json' \
  --data '{"MessageID":"smoke-'$(date +%s)'","From":"smoke@example.test","FromFull":{"Email":"smoke@example.test","Name":"Smoke"},"To":"test@bumpsetdrink.com","Subject":"Bucket split smoke test","TextBody":"hello","Headers":[],"Attachments":[]}' \
  https://hooks.bumpsetdrink.com/postmark/inbound
unset U P
```

Expected: `200`. Then confirm no object remains under `inbound-spool/` in EITHER bucket (the app deletes it after processing), by running the count part of the migration script's logic, e.g. `DOTENV_CONFIG_PATH=.env.local npx tsx scripts/migrate-private-r2-objects.ts` and reading the `inbound-spool/ 0 object(s)` line for the public bucket. If the spool object persists in `bsd-private`, the app failed to process it: check `vercel logs` for `[postmark-webhook]` and fix before Task 5. A new "Bucket split smoke test" ticket will appear in Manage Emails; tell the user so they can close it.

- [ ] **Step 4: Commit**

```bash
git add workers/postmark-inbound/wrangler.jsonc
git commit -m "chore(postmark-inbound): spool into the private bucket"
```

---

### Task 5: Retire the originals and the cut-over fallback

**Files:**
- Modify: `src/app/api/webhooks/postmark/route.ts` (remove the public fallback)

- [ ] **Step 1: Final copy pass, then delete**

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/migrate-private-r2-objects.ts
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/migrate-private-r2-objects.ts --delete
```

Expected from the second run: `copied 0, already present 11, failed 0`, `0 without an object`, `deleted 11 object(s) from bsd`, and `0 left in bsd` for all three prefixes. Exit 0. If it exits 1, nothing was deleted; read the FAILED/ORPHAN lines and fix (re-run the copy) before retrying.

- [ ] **Step 2: Confirm the public bucket has none of the private prefixes**

Run the migration script once more without `--delete`: every prefix line must read `0 object(s) in bsd`.

- [ ] **Step 3: Remove the spool fallback**

In `handleSpooledInbound`, replace the two-scope read with:

```ts
    const object = await getR2Object(spoolKey, "private")
```

and the delete with `await deleteR2Object(spoolKey, "private")`. Drop the `R2Scope` import and the cut-over comment.

- [ ] **Step 4: Verify, commit, push**

Run: `pnpm check-types && pnpm vitest run src/lib/inbound && pnpm lint`

```bash
git add src/app/api/webhooks/postmark/route.ts
git commit -m "chore(inbound): read the spool from the private bucket only

The inbound Worker is on bsd-private and the public inbound-spool/ prefix
is empty, so the cut-over fallback is gone."
git push origin main
```

---

### Task 6: Roll back the catch-all pics-guard Worker

**Files:**
- Revert: commits `b56331e` (AGENTS note about the Worker quota) and `7a64c0c` (catch-all Worker)
- Modify: `workers/pics-guard/src/index.ts` (doc comment only)
- Modify: `AGENTS.md` (pics-guard bullet)

- [ ] **Step 1: Revert, newest first**

```bash
git revert --no-edit b56331e
git revert --no-edit 7a64c0c
git diff HEAD~2 --stat
```

Expected: `workers/pics-guard/wrangler.jsonc`, `workers/pics-guard/src/index.ts`, `workers/pics-guard/test/index.test.ts` and `AGENTS.md` return to their pre-audit content. Confirm the Worker source now matches what is deployed: `git diff 708a47a..HEAD -- workers/pics-guard/src workers/pics-guard/wrangler.jsonc` should be empty except for commit `e4b2943`'s packageManager pin if that touched these paths (it touched `package.json` only).

- [ ] **Step 2: Explain the new division of labour in the Worker header**

In `workers/pics-guard/src/index.ts`, replace the second paragraph of the header comment ("The bucket also holds objects that must never be public…") with:

```ts
 * Objects that must never be public (inbound email attachments, the
 * inbound-mail spool, the score-sheet handwriting corpus) live in a
 * separate bucket with no public domain since 2026-10-07; the real control
 * is that they are not here at all. The private-prefix routes below are
 * kept as a tripwire for anything written under those prefixes by mistake.
 * They are bound by literal path, so a percent-encoded slash skips them
 * (that is why the bucket split exists); do not rely on them for secrecy.
```

Run: `pnpm pics-guard:test` — expected: the original tests pass unchanged.

- [ ] **Step 3: AGENTS.md**

Replace the pics-guard bullet with:

```markdown
- The bucket's public custom domain `pics.bumpsetdrink.com` serves player/team pictures, score-sheet photos and sponsor logos; **every object in the `bsd` bucket is public by key**, so private objects (email attachments, the inbound-email spool, the score-sheet sample corpus) live in `R2_PRIVATE_BUCKET` (`bsd-private`, no custom domain), reached only through the S3 API and 60-second presigned URLs. Any new private object must use `scope: "private"` in `src/lib/r2.ts`; never put it in `bsd`. The `workers/pics-guard/` Worker (`bsd-pics-guard`) serves `sponsorlogos/` with a sandboxing CSP (sponsor contacts may upload SVG) and 404s the old private prefixes on their literal routes as a tripwire; it is not a secrecy boundary (a percent-encoded slash bypasses prefix routes, found in the 2026-10 audit). `pnpm pics-guard:test` / `pics-guard:deploy` (needs a Cloudflare login).
```

- [ ] **Step 4: Commit**

Run: `pnpm lint`

```bash
git add workers/pics-guard/src/index.ts AGENTS.md
git commit -m "docs(pics-guard): the private bucket is the control; the Worker is a tripwire"
```

---

### Task 7: Gates, memory, push

- [ ] **Step 1: Gates**

Run: `pnpm check-types && pnpm check-authz && pnpm test && pnpm pics-guard:test && pnpm worker:test && pnpm lint && pnpm build`
Expected: all green.

- [ ] **Step 2: Memory**

In `/home/kasm-user/.claude/projects/-home-kasm-user-src-bsd-site-nextjs/memory/security-audit-2026-10-06.md`, under item 2, replace the "Worker code fixed (7a64c0c); **`pnpm pics-guard:deploy` still required**" line with: "Resolved 2026-10-07 by bucket split: private prefixes moved to `bsd-private` (no public domain, `R2_PRIVATE_BUCKET`), originals deleted from `bsd`, inbound Worker redeployed onto the private bucket; catch-all pics-guard commit 7a64c0c reverted and never deployed. See `docs/superpowers/plans/2026-10-07-private-r2-bucket-split.md`."

Also update `infra-hardening-2026-10-06.md` if it describes pics-guard as the control for private prefixes: add one line pointing at the bucket split.

- [ ] **Step 3: Push and report**

```bash
git push origin main
```

Confirm the production deployment for the final commit is Ready (same `vercel api` check as Task 3). Final report: commit hashes per task; the migration script's output lines (counts only); the smoke-test result; the Vercel deployment state; and anything skipped.

---

## Self-review

- **Coverage:** scope in r2.ts + private writers (Task 1); bucket + lifecycle + copy (Task 2); env + app deploy (Task 3); Worker binding (Task 4); delete + fallback removal (Task 5); pics-guard rollback (Task 6); gates (Task 7). The user's two asks, "bucket split" and "rollback the picture worker", are Tasks 1-5 and Task 6.
- **Placeholders:** none. The one judgement call left open (Task 3 Step 3, how to exercise a download) says what to do either way.
- **Type consistency:** `R2Scope`/`resolveR2Bucket` in `r2-bucket.ts` match their uses in `r2.ts` and the webhook route; `putR2Object`'s `scope` field matches both private writers; the script's `--delete` semantics match Task 5's expectations.
- **Review Focus:** 1 pinned in Task 1 Step 1; 2 covered by Task 1 Step 7 + Task 4 Step 3; 3 covered by the script's orphan check and the `--delete` refusal; 4 by Task 2 Step 3's stop condition; 5 by Task 6 Step 3's doc.
