/**
 * Which `users` columns an admin may compose when merging two accounts, how
 * they are grouped and labelled, and how a default choice is derived.
 *
 * Kept free of database and React imports so the resolver below unit-tests
 * without a database and the descriptor can be shared by the server action and
 * the client form.
 *
 * Deliberately NOT mergeable:
 *   - `id`         — fixed by whichever account the admin keeps
 *   - `updatedAt`  — stamped by the merge itself
 */

export type MergeFieldKey =
    | "old_id"
    | "picture"
    | "email"
    | "emailVerified"
    | "email_status"
    | "phone"
    | "emergency_contact"
    | "first_name"
    | "last_name"
    | "preferred_name"
    | "name"
    | "pronouns"
    | "male"
    | "experience"
    | "assessment"
    | "height"
    | "skill_setter"
    | "skill_hitter"
    | "skill_passer"
    | "skill_other"
    | "image"
    | "avatar"
    | "avatarUrl"
    | "referred_by"
    | "captain_eligible"
    | "onboarding_completed"
    | "seasons_list"
    | "notification_list"
    | "createdAt"

/** Which of the two accounts a field's surviving value comes from. */
export type MergeChoice = "old" | "new"

/** field -> which account supplies it. Absent keys keep the survivor's value. */
export type MergeSelection = Partial<Record<MergeFieldKey, MergeChoice>>

export type MergeFieldKind = "text" | "number" | "boolean" | "date"

export interface MergeFieldDescriptor {
    key: MergeFieldKey
    label: string
    kind: MergeFieldKind
}

export interface MergeFieldGroup {
    title: string
    fields: MergeFieldDescriptor[]
}

/**
 * Labels mirror what admins already read in the player detail popup and the
 * edit-player form, so the same column is never named two different things in
 * two different screens.
 */
export const MERGE_FIELD_GROUPS: MergeFieldGroup[] = [
    {
        title: "Identity",
        fields: [
            { key: "old_id", label: "Old ID", kind: "number" },
            { key: "picture", label: "Picture", kind: "text" }
        ]
    },
    {
        title: "Contact",
        fields: [
            { key: "email", label: "Email", kind: "text" },
            { key: "emailVerified", label: "Email Verified", kind: "boolean" },
            { key: "email_status", label: "Email Status", kind: "text" },
            { key: "phone", label: "Phone", kind: "text" },
            {
                key: "emergency_contact",
                label: "Emergency Contact",
                kind: "text"
            }
        ]
    },
    {
        title: "Name",
        fields: [
            { key: "first_name", label: "First Name", kind: "text" },
            { key: "last_name", label: "Last Name", kind: "text" },
            { key: "preferred_name", label: "Preferred Name", kind: "text" },
            { key: "name", label: "Display Name", kind: "text" },
            { key: "pronouns", label: "Pronouns", kind: "text" },
            { key: "male", label: "Male", kind: "boolean" }
        ]
    },
    {
        title: "Volleyball Profile",
        fields: [
            { key: "experience", label: "Experience", kind: "text" },
            { key: "assessment", label: "Assessment", kind: "text" },
            { key: "height", label: "Height (inches)", kind: "number" },
            { key: "skill_setter", label: "Skill: Setter", kind: "boolean" },
            { key: "skill_hitter", label: "Skill: Hitter", kind: "boolean" },
            { key: "skill_passer", label: "Skill: Passer", kind: "boolean" },
            { key: "skill_other", label: "Skill: Other", kind: "boolean" }
        ]
    },
    {
        title: "Media & Referral",
        fields: [
            { key: "image", label: "Image URL", kind: "text" },
            { key: "avatar", label: "Avatar", kind: "text" },
            { key: "avatarUrl", label: "Avatar URL", kind: "text" },
            { key: "referred_by", label: "Referred By", kind: "text" }
        ]
    },
    {
        title: "Account",
        fields: [
            {
                key: "captain_eligible",
                label: "Captain Eligible",
                kind: "boolean"
            },
            {
                key: "onboarding_completed",
                label: "Onboarding Completed",
                kind: "boolean"
            },
            { key: "seasons_list", label: "Seasons List", kind: "text" },
            {
                key: "notification_list",
                label: "Notification List",
                kind: "text"
            },
            { key: "createdAt", label: "Member Since", kind: "date" }
        ]
    }
]

export const MERGE_FIELDS: MergeFieldDescriptor[] = MERGE_FIELD_GROUPS.flatMap(
    (g) => g.fields
)

const MERGE_FIELD_KEYS = new Set<string>(MERGE_FIELDS.map((f) => f.key))

export function isMergeFieldKey(value: unknown): value is MergeFieldKey {
    return typeof value === "string" && MERGE_FIELD_KEYS.has(value)
}

export function isMergeChoice(value: unknown): value is MergeChoice {
    return value === "old" || value === "new"
}

/** The subset of a user row the merge UI and resolver care about. */
export type MergeFieldValues = {
    [K in MergeFieldKey]: unknown
}

/**
 * Empty for merge purposes: nothing worth carrying forward. `false` is a real
 * value, not emptiness -- `captain_eligible: false` is a deliberate admin
 * decision and must not lose to the other account's `true` by default.
 */
export function isEmptyFieldValue(value: unknown): boolean {
    if (value === null || value === undefined) {
        return true
    }
    return typeof value === "string" && value.trim().length === 0
}

function sameValue(a: unknown, b: unknown): boolean {
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime()
    }
    return a === b
}

/**
 * Pre-tick the choices an admin would almost always make, so step 2 is a review
 * rather than 29 decisions:
 *
 *   - identical on both sides -> omitted entirely (nothing to choose)
 *   - only one side has a value -> take that side
 *   - both differ -> keep the survivor's, the account the admin already picked
 *   - createdAt -> the earlier date, so "member since" survives the merge
 *   - emailVerified / email_status -> follow the email, since they describe it
 *
 * Returns only keys where a choice is meaningful. Absent keys leave the
 * survivor's stored value untouched.
 */
export function resolveDefaultSelections(
    oldUser: MergeFieldValues,
    newUser: MergeFieldValues
): MergeSelection {
    const selection: MergeSelection = {}

    for (const field of MERGE_FIELDS) {
        const oldValue = oldUser[field.key]
        const newValue = newUser[field.key]

        if (sameValue(oldValue, newValue)) {
            continue
        }

        const oldEmpty = isEmptyFieldValue(oldValue)
        const newEmpty = isEmptyFieldValue(newValue)

        if (oldEmpty && newEmpty) {
            continue
        }

        // Only the survivor being empty forces the old value; otherwise the
        // survivor wins, whether or not the old side has something too.
        selection[field.key] = newEmpty ? "old" : "new"
    }

    // old_id is a serial, so both accounts always have one and the generic
    // "survivor wins" rule would quietly keep a freshly-issued id. Photo
    // filenames are built from `{old_id}_{initials}.jpg`, so the useful default
    // is the side that actually has a photo; failing that, the lower id, which
    // is the older legacy record.
    if (selection.old_id) {
        const oldHasPicture = !isEmptyFieldValue(oldUser.picture)
        const newHasPicture = !isEmptyFieldValue(newUser.picture)

        if (oldHasPicture !== newHasPicture) {
            selection.old_id = oldHasPicture ? "old" : "new"
        } else {
            const oldId = oldUser.old_id
            const newId = newUser.old_id
            if (typeof oldId === "number" && typeof newId === "number") {
                selection.old_id = oldId <= newId ? "old" : "new"
            }
        }

        // Keep the photo with the id it is named after.
        if (selection.picture) {
            selection.picture = selection.old_id
        }
    }

    // createdAt: the older account is the one the member actually joined on.
    if (selection.createdAt) {
        const oldCreated = oldUser.createdAt
        const newCreated = newUser.createdAt
        if (oldCreated instanceof Date && newCreated instanceof Date) {
            selection.createdAt =
                oldCreated.getTime() <= newCreated.getTime() ? "old" : "new"
        }
    }

    // Verification state and deliverability describe a specific address, so
    // they travel with whichever address wins rather than being judged alone.
    if (selection.email) {
        for (const key of ["emailVerified", "email_status"] as const) {
            if (!sameValue(oldUser[key], newUser[key])) {
                selection[key] = selection.email
            }
        }
    }

    return selection
}
