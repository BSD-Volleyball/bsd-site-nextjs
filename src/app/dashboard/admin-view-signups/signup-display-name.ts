import { formatPlayerName } from "@/lib/utils"
import type { SignupEntry } from "./data"

export function getDisplayName(entry: SignupEntry): string {
    return formatPlayerName(
        entry.firstName,
        entry.lastName,
        entry.preferredName
    )
}
