import { SquareClient, SquareEnvironment } from "square"

let _squareClient: SquareClient | null = null

export function getSquareClient(): SquareClient {
    if (!_squareClient) {
        if (!process.env.SQUARE_ACCESS_TOKEN) {
            throw new Error(
                "SQUARE_ACCESS_TOKEN environment variable is required"
            )
        }

        _squareClient = new SquareClient({
            token: process.env.SQUARE_ACCESS_TOKEN,
            environment:
                process.env.SQUARE_ENVIRONMENT === "production"
                    ? SquareEnvironment.Production
                    : SquareEnvironment.Sandbox
        })
    }
    return _squareClient
}

export const squareClient = {
    get customers() {
        return getSquareClient().customers
    },
    get subscriptions() {
        return getSquareClient().subscriptions
    },
    get catalog() {
        return getSquareClient().catalog
    },
    get checkout() {
        return getSquareClient().checkout
    },
    get locations() {
        return getSquareClient().locations
    }
}

export const locationId = process.env.SQUARE_LOCATION_ID || ""
