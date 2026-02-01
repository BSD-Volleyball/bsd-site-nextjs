import { createAuthClient } from "better-auth/react"
import { inferAdditionalFields } from "better-auth/client/plugins"

export const authClient = createAuthClient({
    plugins: [
        inferAdditionalFields({
            user: {
                first_name: {
                    type: "string",
                    required: true
                },
                last_name: {
                    type: "string",
                    required: true
                },
                onboarding_completed: {
                    type: "boolean",
                    required: false
                }
            }
        })
    ]
})
