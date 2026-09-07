import "server-only"
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
