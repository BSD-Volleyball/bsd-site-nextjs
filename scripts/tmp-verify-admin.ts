// Temporary: create a disposable email/password admin for manual browser
// verification of the refactored create-week pages. Deleted after use.
import "dotenv/config"
import { eq } from "drizzle-orm"
import { auth } from "../src/lib/auth"
import { grantRole } from "../src/lib/rbac"
import { db } from "../src/database/db"
import { users } from "../src/database/schema"

const EMAIL = "refactor-verify-admin@example.com"
const PASSWORD = "refactor-verify-1"

async function main() {
    await auth.api.signUpEmail({
        body: {
            email: EMAIL,
            password: PASSWORD,
            name: "Refactor Verify",
            first_name: "Refactor",
            last_name: "Verify"
        } as never
    })

    const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, EMAIL))

    if (!row) {
        throw new Error("user not found after signup")
    }

    await grantRole(row.id, "admin")
    console.log("admin ready:", row.id)
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error(err)
        process.exit(1)
    }
)
