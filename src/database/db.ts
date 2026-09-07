import { drizzle } from "drizzle-orm/node-postgres"

function createDb() {
    return drizzle(process.env.DATABASE_URL!)
}

export type AppDb = ReturnType<typeof createDb>

// Accepts either the root client or a transaction handle, so shared helpers
// (audit log, waiver acceptance, discounts) can participate in a caller's
// db.transaction() instead of writing outside it.
export type DbExecutor =
    | AppDb
    | Parameters<Parameters<AppDb["transaction"]>[0]>[0]

// The pg Pool is created on first use rather than at import time, so merely
// importing a module that touches `db` (tests, scripts, a future runtime
// without global-scope I/O) does not open a connection. Same Proxy shape as
// src/test/pg/db-alias.ts, which stands in for this module under Vitest.
let instance: AppDb | null = null

export const db: AppDb = new Proxy({} as AppDb, {
    get(_target, prop) {
        instance ??= createDb()
        const value = Reflect.get(instance, prop, instance)
        return typeof value === "function" ? value.bind(instance) : value
    }
})
