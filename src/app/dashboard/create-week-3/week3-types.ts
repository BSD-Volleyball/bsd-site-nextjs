// Week-3 aliases for the shared preseason types (src/lib/preseason/types.ts).

export type {
    PreseasonDivision as Week3Division,
    Week3Candidate,
    SavedAssignment as Week3SavedAssignment
} from "@/lib/preseason/types"

export interface Week3ExcludedPlayer {
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
}
