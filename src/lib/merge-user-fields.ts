/**
 * Which `users` columns an admin may compose when merging two accounts, how
 * they are grouped and labelled, and how a default choice is derived.
 *
 * Kept free of database and React imports so the resolver below unit-tests
 * without a database and the descriptor can be shared by the server action and
 * the client form.
 *
 * The two accounts are symmetric: the admin picks a Player A and a Player B in
 * whatever order, and every consequential decision is made here, field by
 * field. Nothing about A or B is privileged.
 *
 * Deliberately NOT mergeable:
 *   - `id`         — fixed by the `email` choice, which decides which row
 *                    survives so that logins always follow the address
 *   - `updatedAt`  — stamped by the merge itself
 */

import { isLegacyEmail } from "./legacy-matching"

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
export type MergeChoice = "a" | "b"

/**
 * field -> which account supplies it. Absent keys are fields the two accounts
 * already agree on, so there is nothing to choose.
 */
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
    return value === "a" || value === "b"
}

/** The other side. */
export function otherChoice(choice: MergeChoice): MergeChoice {
    return choice === "a" ? "b" : "a"
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
 * Account facts that are not themselves mergeable columns but that the default
 * rules need to break ties. Kept as plain values so this module stays free of
 * database imports and unit-tests without one.
 */
export interface MergeDefaultsContext {
    /** `users.updatedAt` — proxy for which record was maintained most recently. */
    aUpdatedAt: Date | null
    bUpdatedAt: Date | null
    /** How many better-auth providers each account can sign in with. */
    aLoginMethodCount: number
    bLoginMethodCount: number
    /** Newest session start, or null if the account has never signed in. */
    aLastLoginAt: Date | null
    bLastLoginAt: Date | null
}

function newer(a: Date | null, b: Date | null): MergeChoice | null {
    if (a instanceof Date && b instanceof Date) {
        if (a.getTime() === b.getTime()) {
            return null
        }
        return a.getTime() > b.getTime() ? "a" : "b"
    }
    if (a instanceof Date) {
        return "a"
    }
    if (b instanceof Date) {
        return "b"
    }
    return null
}

/**
 * When exactly one of the two accounts is a `legacy-*` placeholder, the side
 * holding the real membership. Null when both or neither are placeholders,
 * which leaves the ordinary rules to decide.
 */
function realAccountSide(aEmail: unknown, bEmail: unknown): MergeChoice | null {
    const aPlaceholder = isLegacyEmail(
        typeof aEmail === "string" ? aEmail : null
    )
    const bPlaceholder = isLegacyEmail(
        typeof bEmail === "string" ? bEmail : null
    )
    if (aPlaceholder === bPlaceholder) {
        return null
    }
    return aPlaceholder ? "b" : "a"
}

/**
 * Which account should supply the surviving email — and therefore, since the
 * survivor is the account whose address wins, which record survives the merge
 * at all.
 *
 * A `legacy-*` placeholder address is never a real mailbox, so it loses to a
 * genuine one outright: the archive backfill minted it precisely because it
 * could not find the member, and keeping it would leave the surviving record
 * unreachable. Otherwise logins decide, since they live on an account rather
 * than on an address, and recency breaks the remaining ties.
 */
function resolveEmailDefault(
    aEmail: unknown,
    bEmail: unknown,
    ctx: MergeDefaultsContext
): MergeChoice {
    const realSide = realAccountSide(aEmail, bEmail)
    if (realSide) {
        return realSide
    }

    if (ctx.aLoginMethodCount !== ctx.bLoginMethodCount) {
        return ctx.aLoginMethodCount > ctx.bLoginMethodCount ? "a" : "b"
    }
    return (
        newer(ctx.aLastLoginAt, ctx.bLastLoginAt) ??
        newer(ctx.aUpdatedAt, ctx.bUpdatedAt) ??
        "a"
    )
}

/**
 * Pre-tick the choices an admin would almost always make, so step 2 is a review
 * rather than 29 decisions:
 *
 *   - identical on both sides -> omitted entirely (nothing to choose)
 *   - only one side has a value -> take that side
 *   - both differ -> the more recently updated account, as the fresher record
 *   - email -> the account that can actually sign in (see resolveEmailDefault)
 *   - old_id -> the side with a photo, else the lower (older) id
 *   - createdAt -> the earlier date, so "member since" survives the merge
 *   - emailVerified / email_status -> follow the email, since they describe it
 *   - a `legacy-*` placeholder -> loses every contested field to the real
 *     member, but still supplies anything the member does not have
 *
 * Symmetric in A and B: swapping the two arguments (and the context fields)
 * yields the mirrored selection. Returns only keys where a choice is
 * meaningful; absent keys are fields the accounts already agree on.
 */
export function resolveDefaultSelections(
    userA: MergeFieldValues,
    userB: MergeFieldValues,
    ctx: MergeDefaultsContext
): MergeSelection {
    const selection: MergeSelection = {}
    const fresher = newer(ctx.aUpdatedAt, ctx.bUpdatedAt) ?? "a"

    for (const field of MERGE_FIELDS) {
        const aValue = userA[field.key]
        const bValue = userB[field.key]

        if (sameValue(aValue, bValue)) {
            continue
        }

        const aEmpty = isEmptyFieldValue(aValue)
        const bEmpty = isEmptyFieldValue(bValue)

        if (aEmpty && bEmpty) {
            continue
        }

        // A real value always beats an empty one. With both sides populated
        // there is nothing in the values themselves to prefer, so fall back to
        // whichever record was touched more recently.
        if (aEmpty || bEmpty) {
            selection[field.key] = aEmpty ? "b" : "a"
        } else {
            selection[field.key] = fresher
        }
    }

    // The email decides which row survives, so it is never left to the generic
    // recency rule. `users.email` is UNIQUE NOT NULL, so the two sides always
    // differ and this key is always present.
    if (selection.email) {
        selection.email = resolveEmailDefault(userA.email, userB.email, ctx)
    }

    // old_id is a serial, so both accounts always have one and the recency rule
    // would quietly keep a freshly-issued id. Photo filenames are built from
    // `{old_id}_{initials}.jpg`, so the useful default is the side that
    // actually has a photo; failing that, the lower id, which is the older
    // legacy record.
    if (selection.old_id) {
        const aHasPicture = !isEmptyFieldValue(userA.picture)
        const bHasPicture = !isEmptyFieldValue(userB.picture)

        if (aHasPicture !== bHasPicture) {
            selection.old_id = aHasPicture ? "a" : "b"
        } else {
            const aId = userA.old_id
            const bId = userB.old_id
            if (typeof aId === "number" && typeof bId === "number") {
                selection.old_id = aId <= bId ? "a" : "b"
            }
        }

        // Keep the photo with the id it is named after.
        if (selection.picture) {
            selection.picture = selection.old_id
        }
    }

    // createdAt: the older account is the one the member actually joined on.
    if (selection.createdAt) {
        const aCreated = userA.createdAt
        const bCreated = userB.createdAt
        if (aCreated instanceof Date && bCreated instanceof Date) {
            selection.createdAt =
                aCreated.getTime() <= bCreated.getTime() ? "a" : "b"
        }
    }

    // Verification state and deliverability describe a specific address, so
    // they travel with whichever address wins rather than being judged alone.
    if (selection.email) {
        for (const key of ["emailVerified", "email_status"] as const) {
            if (!sameValue(userA[key], userB[key])) {
                selection[key] = selection.email
            }
        }
    }

    // A `legacy-*` placeholder is a husk the archive backfill invented for a
    // player it could not identify: a freshly-issued old_id, a made-up address,
    // and the short form of a name. Only its records are worth anything, so the
    // real member wins every contested field -- overriding the rules above,
    // which have no way to tell a synthetic record from a maintained one. The
    // placeholder still supplies anything the member simply does not have,
    // where there is nothing to lose by taking it.
    const realSide = realAccountSide(userA.email, userB.email)
    if (realSide) {
        const placeholderSide = otherChoice(realSide)
        const realFields = realSide === "a" ? userA : userB
        for (const key of Object.keys(selection) as MergeFieldKey[]) {
            if (
                selection[key] === placeholderSide &&
                !isEmptyFieldValue(realFields[key])
            ) {
                selection[key] = realSide
            }
        }
    }

    return selection
}
