import { db } from "@/database/db"
import { sql } from "drizzle-orm"
import { logger } from "@/lib/logger"

export async function GET() {
    try {
        await db.execute(sql`SELECT 1`)
        return Response.json({ status: "ok" })
    } catch (error) {
        logger.error("Health check database query failed", undefined, error)
        return Response.json({ status: "error" }, { status: 500 })
    }
}
