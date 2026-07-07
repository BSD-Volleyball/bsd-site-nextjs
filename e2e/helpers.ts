// Personas created by e2e/setup/auth.setup.ts. Each has a saved
// storageState so specs can run pre-authenticated via test.use().

export interface Persona {
    email: string
    password: string
    firstName: string
    lastName: string
    storageState: string
}

export const PERSONAS = {
    admin: {
        email: "e2e-admin@example.test",
        password: "e2e-password-admin",
        firstName: "Ada",
        lastName: "Admin",
        storageState: "e2e/.auth/admin.json"
    },
    captain: {
        email: "e2e-captain@example.test",
        password: "e2e-password-captain",
        firstName: "Cal",
        lastName: "Captain",
        storageState: "e2e/.auth/captain.json"
    },
    player: {
        email: "e2e-player@example.test",
        password: "e2e-password-player",
        firstName: "Pat",
        lastName: "Player",
        storageState: "e2e/.auth/player.json"
    }
} satisfies Record<string, Persona>
