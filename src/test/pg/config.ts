// Connection settings shared by the integration-test harness.
// TEST_PG_URL is a base URL WITHOUT a database name; the harness appends
// the template/worker database it needs.
const DEFAULT_TEST_PG_URL = "postgres://bsd_test:bsd_test@localhost:5432"

export const TEMPLATE_DB = "bsd_test_template"

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
    return `bsd_test_w${process.env.VITEST_WORKER_ID ?? "0"}`
}
