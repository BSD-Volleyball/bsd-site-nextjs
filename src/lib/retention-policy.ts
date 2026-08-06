/**
 * The history retention window, in one client-safe place.
 *
 * Both notification_log and audit_log are trimmed to this window by the
 * nightly prune (src/lib/retention.ts). The admin views that page through
 * those tables import the same constants, so what the UI promises can never
 * drift from what the job actually deletes.
 */

export const RETENTION_DAYS = 365

export const RETENTION_LABEL = "1 year"
