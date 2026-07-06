// Replaces "@/database/db" in the Vitest *unit* project (see vitest.config.ts).
// Unit tests cover pure logic only; any code path that reaches for the
// database under a unit test is a test-design error, so fail loudly instead
// of silently querying something.
export const db = new Proxy(
    {},
    {
        get(_target, prop) {
            throw new Error(
                `Unit tests must not access the database (attempted db.${String(prop)}). ` +
                    "Write this as an integration test (*.integration.test.ts) instead."
            )
        }
    }
) as never
