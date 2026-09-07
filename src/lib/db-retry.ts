import { logger } from "@/lib/logger"

/**
 * Retries a database operation on transient failures: deadlocks (e.g. a
 * concurrent migration holding exclusive locks), serialization conflicts,
 * and dropped pooler connections — the failure modes that can strand a
 * member who has already been charged. Non-transient errors rethrow
 * immediately.
 *
 * Only wrap work that is safe to re-run from the top: a full transaction
 * that rolls back on failure and is guarded by a unique constraint, so even a
 * lost commit acknowledgement cannot double-apply.
 */
const TRANSIENT_PG_CODES = new Set([
    "40001",
    "40P01",
    "57P01",
    "08003",
    "08006"
])

export function isTransientDbError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false
    const e = error as { code?: string; message?: string; cause?: unknown }
    if (e.code && TRANSIENT_PG_CODES.has(e.code)) return true
    if (
        typeof e.message === "string" &&
        (e.message.includes("Connection terminated") ||
            e.message.includes("ECONNRESET"))
    ) {
        return true
    }
    return e.cause ? isTransientDbError(e.cause) : false
}

export async function withTransientRetry<T>(
    fn: () => Promise<T>,
    attempts = 3
): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            if (attempt === attempts || !isTransientDbError(error)) {
                throw error
            }
            logger.warn("Transient DB error — retrying transaction", {
                attempt
            })
            await new Promise((resolve) => setTimeout(resolve, attempt * 300))
        }
    }
    throw lastError
}
