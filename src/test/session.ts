import { db } from "@/database/db"
import { userRoles, users } from "@/database/schema"
import type { Role } from "@/lib/permissions"

// Fabricated better-auth sessions for integration tests.
//
// The "@/lib/auth" module is mocked (see setup.integration.ts) so that
// auth.api.getSession() returns whatever loginAs() last set. Role checks
// stay REAL: rbac.ts still queries the user_roles rows these helpers insert
// into the test database, so requireAdmin/requirePermission are genuinely
// exercised.

type TestUser = typeof users.$inferSelect

let currentUser: TestUser | null = null

export function loginAs(user: TestUser): void {
    currentUser = user
}

export function logout(): void {
    currentUser = null
}

// Shaped like the better-auth session that auth.api.getSession() resolves to
export function getCurrentTestSession() {
    if (!currentUser) return null
    const now = new Date()
    return {
        user: {
            id: currentUser.id,
            email: currentUser.email,
            emailVerified: currentUser.emailVerified,
            name:
                currentUser.name ??
                `${currentUser.first_name} ${currentUser.last_name}`,
            image: currentUser.image,
            createdAt: currentUser.createdAt,
            updatedAt: currentUser.updatedAt,
            first_name: currentUser.first_name,
            last_name: currentUser.last_name,
            preferred_name: currentUser.preferred_name,
            onboarding_completed: currentUser.onboarding_completed
        },
        session: {
            id: `test-session-${currentUser.id}`,
            token: `test-token-${currentUser.id}`,
            userId: currentUser.id,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            createdAt: now,
            updatedAt: now,
            ipAddress: null,
            userAgent: "vitest"
        }
    }
}

let userCounter = 0

export async function createUser(
    overrides: Partial<typeof users.$inferInsert> = {}
): Promise<TestUser> {
    userCounter++
    const [row] = await db
        .insert(users)
        .values({
            id: crypto.randomUUID(),
            first_name: "Test",
            last_name: `User${userCounter}`,
            name: `Test User${userCounter}`,
            email: `test-user-${userCounter}-${crypto.randomUUID().slice(0, 8)}@example.test`,
            onboarding_completed: true,
            ...overrides
        })
        .returning()
    return row
}

/**
 * The standard opener for integration tests: creates a user, inserts the
 * given user_roles rows, and logs the fabricated session in as that user.
 */
export async function createUserWithRoles(
    roles: Array<{ role: Role; seasonId?: number; divisionId?: number }>,
    overrides: Partial<typeof users.$inferInsert> = {}
): Promise<TestUser> {
    const user = await createUser(overrides)
    if (roles.length > 0) {
        await db.insert(userRoles).values(
            roles.map((r) => ({
                user_id: user.id,
                role: r.role,
                season_id: r.seasonId ?? null,
                division_id: r.divisionId ?? null
            }))
        )
    }
    loginAs(user)
    return user
}
