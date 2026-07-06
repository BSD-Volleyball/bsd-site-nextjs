import type { NodePgDatabase } from "drizzle-orm/node-postgres"

// Replaces "@/database/db" in the Vitest *integration* project (see
// vitest.config.ts). All 100+ modules that import the db singleton
// transparently hit the current worker's cloned test database instead.
//
// A Proxy (rather than a mutable export) means module-load order never
// matters: the instance is looked up on every property access, and a query
// fired before setup.integration.ts ran fails with a clear message instead
// of hitting a stale or missing connection.

type AppDb = NodePgDatabase

let current: AppDb | null = null

export function setTestDb(next: AppDb | null): void {
    current = next
}

export const db = new Proxy({} as AppDb, {
    get(_target, prop) {
        if (!current) {
            throw new Error(
                "Integration-test database is not initialized — " +
                    "setup.integration.ts must run before any db access."
            )
        }
        const value = Reflect.get(current, prop, current)
        return typeof value === "function" ? value.bind(current) : value
    }
})
