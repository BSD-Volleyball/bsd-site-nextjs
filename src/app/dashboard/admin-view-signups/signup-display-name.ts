import { formatPlayerName } from "@/lib/utils"
import type { SignupEntry } from "./actions"

export function getDisplayName(entry: SignupEntry): string {
    return formatPlayerName(
        entry.firstName,
        entry.lastName,
        entry.preferredName
    )
}
