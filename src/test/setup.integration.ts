import { drizzle } from "drizzle-orm/node-postgres"
import { Client, Pool } from "pg"
import { afterAll, beforeAll, beforeEach, vi } from "vitest"
import { setTestDb } from "@/test/pg/db-alias"
import {
    TEMPLATE_DB,
    getTestPgBaseUrl,
    testDbUrl,
    workerDbName
} from "@/test/pg/config"
import { logout } from "@/test/session"

// ---------------------------------------------------------------------------
// Framework mocks — modules that throw outside a real Next request scope
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
    headers: async () => new Headers(),
    cookies: async () => ({
        get: () => undefined,
        getAll: () => [],
        has: () => false
    })
}))

// 30+ actions call revalidatePath after mutations; outside a request scope
// the real one throws. The spies let tests assert revalidation happened.
vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
    unstable_cache: (fn: unknown) => fn,
    unstable_noStore: () => {}
}))

// better-auth never boots in integration tests. Its only consumed API is
// auth.api.getSession, which resolves to the session fabricated via
// loginAs()/logout() in @/test/session. Real auth coverage lives in e2e.
vi.mock("@/lib/auth", async () => {
    const { getCurrentTestSession } = await import("@/test/session")
    return {
        auth: {
            api: {
                getSession: async () => getCurrentTestSession()
            }
        }
    }
})

// ---------------------------------------------------------------------------
// External service mocks — assertable seams, no network
// ---------------------------------------------------------------------------

vi.mock("@/lib/postmark", () => ({
    STREAM_OUTBOUND: "outbound",
    STREAM_BROADCAST: "broadcast",
    STREAM_IN_SEASON_UPDATES: "in-season-updates",
    sendEmail: vi.fn(async () => "test-message-id"),
    sendBatchEmails: vi.fn(async (messages: unknown[]) => ({
        sent: messages.length,
        failed: 0
    })),
    sendBroadcastEmails: vi.fn(async (opts: { recipients: unknown[] }) => ({
        sent: opts.recipients.length,
        failed: 0
    }))
}))

vi.mock("@/lib/r2", () => ({
    PLAYER_PICTURE_MAX_BYTES: 10 * 1024 * 1024,
    createPlayerPictureUploadPresignedUrl: vi.fn(
        async () => "https://r2.test/presigned-upload"
    ),
    deleteR2Object: vi.fn(async () => {})
}))

// ---------------------------------------------------------------------------
// Per-file database lifecycle: clone the migrated template, then truncate
// between tests. Template restore is a cheap file-level copy (~100-300ms).
// ---------------------------------------------------------------------------

let pool: Pool | null = null
let truncateSql = ""

beforeAll(async () => {
    const base = getTestPgBaseUrl()
    const dbName = workerDbName()

    const admin = new Client({ connectionString: `${base}/postgres` })
    await admin.connect()
    try {
        // Serialize clones across parallel workers; concurrent CREATE
        // DATABASE from one template can trip over the template lock.
        await admin.query("SELECT pg_advisory_lock(727272)")
        try {
            await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
            await admin.query(
                `CREATE DATABASE ${dbName} TEMPLATE ${TEMPLATE_DB}`
            )
        } finally {
            await admin.query("SELECT pg_advisory_unlock(727272)")
        }
    } finally {
        await admin.end()
    }

    pool = new Pool({ connectionString: testDbUrl(dbName), max: 4 })
    setTestDb(drizzle(pool))

    const { rows } = await pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    )
    truncateSql = `TRUNCATE TABLE ${rows
        .map((r: { tablename: string }) => `"${r.tablename}"`)
        .join(", ")} RESTART IDENTITY CASCADE`
})

beforeEach(async () => {
    if (!pool) throw new Error("Integration test pool missing")
    await pool.query(truncateSql)
    logout()
    vi.clearAllMocks()
})

afterAll(async () => {
    setTestDb(null)
    await pool?.end()
})
