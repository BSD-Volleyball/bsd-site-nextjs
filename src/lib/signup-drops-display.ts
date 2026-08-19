// Canonical drop-category/stage definitions. This file is import-safe from
// client components (no schema/db dependency); schema.ts imports the types.

export const SIGNUP_DROP_CATEGORIES = [
    "injury",
    "schedule_conflict",
    "moved",
    "personal",
    "other"
] as const
export type SignupDropCategory = (typeof SIGNUP_DROP_CATEGORIES)[number]

export type SignupDropStage = "pre_draft" | "post_draft"

export const DROP_CATEGORY_LABELS: Record<SignupDropCategory, string> = {
    injury: "Injury",
    schedule_conflict: "Schedule conflict",
    moved: "Moved away",
    personal: "Personal/family",
    other: "Other"
}

export function dropCategoryLabel(category: string): string {
    return (
        DROP_CATEGORY_LABELS[category as SignupDropCategory] ??
        category.replace(/_/g, " ")
    )
}

export const DROP_STAGE_LABELS: Record<SignupDropStage, string> = {
    pre_draft: "Pre-draft",
    post_draft: "Post-draft"
}

export function dropStageLabel(stage: string): string {
    return DROP_STAGE_LABELS[stage as SignupDropStage] ?? stage
}
