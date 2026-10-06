// Connection settings shared by the integration-test harness.
// TEST_PG_URL is a base URL WITHOUT a database name; the harness appends
// the template/worker database it needs.
const DEFAULT_TEST_PG_URL = "postgres://bsd_test:bsd_test@localhost:5432"

// TEST_DB_PREFIX lets two test runs share one Postgres without dropping
// each other's databases (e.g. parallel agents or worktrees). Unset, the
// names are the historical bsd_test_*.
const DB_PREFIX = (process.env.TEST_DB_PREFIX ?? "bsd_test").replace(
    /[^a-z0-9_]/gi,
    ""
)

export const TEMPLATE_DB = `${DB_PREFIX}_template`

export function getTestPgBaseUrl(): string {
    const base = (process.env.TEST_PG_URL ?? DEFAULT_TEST_PG_URL).replace(
        /\/+$/,
        ""
    )
    const { hostname } = new URL(base)
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        throw new Error(
            `TEST_PG_URL must point at localhost (got "${hostname}") — ` +
                "refusing to run integration tests against a remote database."
        )
    }
    return base
}

export function testDbUrl(dbName: string): string {
    return `${getTestPgBaseUrl()}/${dbName}`
}

// Each Vitest fork gets its own database so parallel workers never collide.
export function workerDbName(): string {
    return `${DB_PREFIX}_w${process.env.VITEST_WORKER_ID ?? "0"}`
}
