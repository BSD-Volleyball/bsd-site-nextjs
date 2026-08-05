/**
 * email-subject.ts — Shared "[BSD] " subject prefix for broadcast emails.
 *
 * Every broadcast leaves with the prefix so recipients can filter on it. The
 * compose form shows the prefix as a static adornment ahead of the subject
 * input, but admins still paste subjects that already carry it (from a
 * template, or from a previous send loaded back into the composer), so the
 * prefix is stripped before it is re-applied — never doubled.
 */

export const EMAIL_SUBJECT_PREFIX = "[BSD] "

/**
 * Matches one or more leading "[BSD]" markers, tolerating surrounding
 * whitespace and any casing: "[bsd]", "  [ BSD ] [BSD]  ", etc.
 */
const LEADING_PREFIX_PATTERN = /^(?:\s*\[\s*bsd\s*\]\s*)+/i

/** The subject as typed, with any leading "[BSD]" markers removed. */
export function stripEmailSubjectPrefix(subject: string): string {
    return subject.replace(LEADING_PREFIX_PATTERN, "").trim()
}

/** The subject exactly as it should appear in a recipient's inbox. */
export function applyEmailSubjectPrefix(subject: string): string {
    return `${EMAIL_SUBJECT_PREFIX}${stripEmailSubjectPrefix(subject)}`
}
