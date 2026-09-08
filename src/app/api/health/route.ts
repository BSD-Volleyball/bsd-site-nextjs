import { db } from "@/database/db"
import { sql } from "drizzle-orm"
import { logger } from "@/lib/logger"

// Liveness probe. An external monitor polls this once a minute; keeping the
// default path database-free lets the Neon compute suspend when the site is
// idle instead of being pinned awake by the probe. Pass ?db=1 for a deep
// check that also round-trips the database.
export async function GET(request: Request) {
    const deep = new URL(request.url).searchParams.get("db") === "1"
    if (!deep) {
        return Response.json({ status: "ok" })
    }

    try {
        await db.execute(sql`SELECT 1`)
        return Response.json({ status: "ok" })
    } catch (error) {
        logger.error("Health check database query failed", undefined, error)
        return Response.json({ status: "error" }, { status: 500 })
    }
}
