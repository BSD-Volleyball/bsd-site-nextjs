import "server-only"
import { createHash } from "node:crypto"
import { SquareClient, SquareEnvironment } from "square"

/**
 * Square payments client. Sandbox unless SQUARE_ENVIRONMENT=production, so a
 * misconfigured deploy can never take real money by accident.
 *
 * Integration tests mock the "square" module (the SquareClient constructor),
 * which is why this stays a thin factory rather than a cached singleton.
 */
export function getSquareClient(): SquareClient {
    return new SquareClient({
        token: process.env.SQUARE_ACCESS_TOKEN,
        environment:
            process.env.SQUARE_ENVIRONMENT === "production"
                ? SquareEnvironment.Production
                : SquareEnvironment.Sandbox
    })
}

/**
 * Idempotency key for a charge. Derived rather than random so resubmitting
 * the same card token (a retried request, a double-click that reuses the
 * token) returns the original payment instead of charging twice. The parts
 * must include the token and the amount: Square rejects a reused key whose
 * parameters differ, which would break a retry with a new card after a
 * decline. Square caps keys at 45 characters.
 */
export function chargeIdempotencyKey(
    ...parts: (string | number | bigint)[]
): string {
    return createHash("sha256")
        .update(parts.join("|"))
        .digest("hex")
        .slice(0, 45)
}
