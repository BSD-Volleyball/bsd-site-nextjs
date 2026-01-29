import { squareClient } from "./client"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { randomUUID } from "crypto"

export async function createSquareCustomer(
    userId: string,
    email: string,
    firstName?: string,
    lastName?: string
): Promise<string> {
    const response = await squareClient.customers.create({
        idempotencyKey: randomUUID(),
        emailAddress: email,
        givenName: firstName || undefined,
        familyName: lastName || undefined,
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
    firstName?: string,
    lastName?: string
): Promise<string> {
    const [user] = await db
        .select({ squareCustomerId: users.squareCustomerId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    if (user?.squareCustomerId) {
        return user.squareCustomerId
    }

    return createSquareCustomer(userId, email, firstName, lastName)
}

export async function getSquareCustomer(customerId: string) {
    const response = await squareClient.customers.get({ customerId })
    return response.customer
}
