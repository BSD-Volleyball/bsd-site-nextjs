/**
 * Matching a `legacy-*` placeholder account to the real member it belongs to.
 *
 * The archive backfill could only bind a historical roster entry to an account
 * on an exact first+last name match, so anyone recorded under a short form --
 * Bill for William, Bob for Robert -- got a synthetic placeholder account
 * instead and their history never reached their profile.
 *
 * Pure logic, deliberately free of any database import so it can be unit
 * tested and reused by scripts/link-legacy-players.ts.
 */

export const LEGACY_EMAIL_PREFIX = "legacy-"

/** Placeholder accounts minted by the archive backfill, both flavours. */
export function isLegacyEmail(email: string | null | undefined): boolean {
    return (email ?? "").startsWith(LEGACY_EMAIL_PREFIX)
}

export type LegacyKind = "roster" | "hoc"

export function legacyKind(email: string): LegacyKind {
    return email.startsWith("legacy-hoc-") ? "hoc" : "roster"
}

/** Why a candidate was proposed. Ordered loosely from strongest to weakest. */
export type MatchReason = "exact" | "nickname" | "spacing" | "prefix"

const NICKNAMES: [string, string][] = [
    ["mike", "michael"],
    ["mikey", "michael"],
    ["bob", "robert"],
    ["rob", "robert"],
    ["bobby", "robert"],
    ["bill", "william"],
    ["will", "william"],
    ["billy", "william"],
    ["jim", "james"],
    ["jimmy", "james"],
    ["jamie", "james"],
    ["dave", "david"],
    ["dan", "daniel"],
    ["danny", "daniel"],
    ["tom", "thomas"],
    ["tommy", "thomas"],
    ["chris", "christopher"],
    ["chris", "christina"],
    ["chris", "christine"],
    ["steve", "steven"],
    ["steve", "stephen"],
    ["joe", "joseph"],
    ["joey", "joseph"],
    ["tony", "anthony"],
    ["nick", "nicholas"],
    ["matt", "matthew"],
    ["jeff", "jeffrey"],
    ["ken", "kenneth"],
    ["ron", "ronald"],
    ["rick", "richard"],
    ["dick", "richard"],
    ["rich", "richard"],
    ["ed", "edward"],
    ["eddie", "edward"],
    ["ted", "edward"],
    ["greg", "gregory"],
    ["andy", "andrew"],
    ["drew", "andrew"],
    ["pete", "peter"],
    ["sam", "samuel"],
    ["sam", "samantha"],
    ["ben", "benjamin"],
    ["alex", "alexander"],
    ["alex", "alexandra"],
    ["max", "maxwell"],
    ["phil", "philip"],
    ["phil", "phillip"],
    ["tim", "timothy"],
    ["ray", "raymond"],
    ["larry", "lawrence"],
    ["jerry", "gerald"],
    ["frank", "franklin"],
    ["doug", "douglas"],
    ["don", "donald"],
    ["hank", "henry"],
    ["gabe", "gabriel"],
    ["zach", "zachary"],
    ["josh", "joshua"],
    ["nate", "nathan"],
    ["vince", "vincent"],
    ["pat", "patrick"],
    ["pat", "patricia"],
    ["kate", "katherine"],
    ["katie", "katherine"],
    ["kathy", "katherine"],
    ["cathy", "catherine"],
    ["liz", "elizabeth"],
    ["beth", "elizabeth"],
    ["betsy", "elizabeth"],
    ["sue", "susan"],
    ["susie", "susan"],
    ["jen", "jennifer"],
    ["jenny", "jennifer"],
    ["becky", "rebecca"],
    ["becca", "rebecca"],
    ["deb", "deborah"],
    ["debbie", "deborah"],
    ["kim", "kimberly"],
    ["cindy", "cynthia"],
    ["peggy", "margaret"],
    ["maggie", "margaret"],
    ["meg", "margaret"],
    ["nancy", "ann"],
    ["annie", "ann"],
    ["barb", "barbara"],
    ["barbie", "barbara"],
    ["carol", "caroline"],
    ["char", "charlotte"],
    ["dee", "diane"],
    ["jess", "jessica"],
    ["mandy", "amanda"],
    ["mel", "melissa"],
    ["mel", "melanie"],
    ["nat", "natalie"],
    ["steph", "stephanie"],
    ["tina", "christina"],
    ["trish", "patricia"],
    ["val", "valerie"],
    ["vicky", "victoria"]
]

const nickMap = new Map<string, Set<string>>()
for (const [a, b] of NICKNAMES) {
    if (!nickMap.has(a)) nickMap.set(a, new Set())
    if (!nickMap.has(b)) nickMap.set(b, new Set())
    nickMap.get(a)?.add(b)
    nickMap.get(b)?.add(a)
}

export const norm = (s: string) =>
    (s ?? "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z ]/g, "")

/** How two normalized first names relate, or null if they do not. */
export function reasonFor(a: string, b: string): MatchReason | null {
    if (a === b) return "exact"
    if (nickMap.get(a)?.has(b)) return "nickname"
    if (a.replace(/\s/g, "") === b.replace(/\s/g, "")) return "spacing"
    if (
        (a.startsWith(b) || b.startsWith(a)) &&
        Math.min(a.length, b.length) >= 3
    ) {
        return "prefix"
    }
    return null
}

export interface NamedAccount {
    id: string
    firstName: string
    lastName: string
}

export interface SuggestionInput<T extends NamedAccount> {
    legacy: NamedAccount
    /** Real (non-legacy) accounts to choose from. */
    candidates: T[]
    /**
     * Ids that share a team with the legacy account. Nobody appears on a
     * roster twice, so a shared team means two different people who happened
     * to play together -- not one person recorded twice. Fall 2009 B "Team
     * Jimenez" lists Jimmy, James AND Jeff Jimenez on one roster.
     */
    sameTeamIds?: ReadonlySet<string>
}

/**
 * The single real account a legacy placeholder should merge into, or null.
 *
 * Returns null whenever more than one candidate survives: choosing between two
 * people is a decision for the admin, not for a heuristic.
 */
export function suggestMatch<T extends NamedAccount>({
    legacy,
    candidates,
    sameTeamIds
}: SuggestionInput<T>): { target: T; reason: MatchReason } | null {
    const legacyLast = norm(legacy.lastName)
    const legacyFirst = norm(legacy.firstName)

    const matches: { target: T; reason: MatchReason }[] = []
    for (const candidate of candidates) {
        if (candidate.id === legacy.id) continue
        if (sameTeamIds?.has(candidate.id)) continue
        if (norm(candidate.lastName) !== legacyLast) continue
        const reason = reasonFor(legacyFirst, norm(candidate.firstName))
        if (reason) matches.push({ target: candidate, reason })
    }

    return matches.length === 1 ? matches[0] : null
}
