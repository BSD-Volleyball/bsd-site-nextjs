import { squareClient } from "./client"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { randomUUID } from "crypto"

export async function createSquareCustomer(
    userId: string,
    email: string,
    first_name?: string,
    last_name?: string
): Promise<string> {
    const response = await squareClient.customers.create({
        idempotencyKey: randomUUID(),
        emailAddress: email,
        givenName: first_name || undefined,
        familyName: last_name || undefined,
        referenceId: userId
    })

    const customerId = response.customer?.id
    if (!customerId) {
        throw new Error("Failed to create Square customer")
    }

    await db
        .update(users)
        .set({ squareCustomerId: customerId })
        .where(eq(users.id, userId))

    return customerId
}

export async function getOrCreateSquareCustomer(
    userId: string,
    email: string,
    first_name?: string,
    last_name?: string
): Promise<string> {
    const [user] = await db
        .select({ squareCustomerId: users.squareCustomerId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    if (user?.squareCustomerId) {
        return user.squareCustomerId
    }

    return createSquareCustomer(userId, email, first_name, last_name)
}

export async function getSquareCustomer(customerId: string) {
    const response = await squareClient.customers.get({ customerId })
    return response.customer
}
