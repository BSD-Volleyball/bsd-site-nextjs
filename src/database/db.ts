import { drizzle } from "drizzle-orm/node-postgres"
export const db = drizzle(process.env.DATABASE_URL!)

// Accepts either the root client or a transaction handle, so shared helpers
// (audit log, waiver acceptance, discounts) can participate in a caller's
// db.transaction() instead of writing outside it.
export type DbExecutor =
    | typeof db
    | Parameters<Parameters<typeof db.transaction>[0]>[0]
