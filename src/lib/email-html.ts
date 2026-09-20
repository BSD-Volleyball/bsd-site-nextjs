/**
 * email-html.ts — HTML email rendering utilities for non-auth emails.
 *
 * All non-auth transactional emails are rendered as HTML strings using these
 * helpers. The base layout includes the BSD logo header, content area, and
 * optional CTA button, matching the style of the better-auth EmailTemplate.
 */

import { site } from "@/config/site"
import {
    coverageDateTitle,
    formatCoverageDate,
    formatSlotLabel
} from "@/lib/coverage/format"
import type {
    CoverageDate,
    CoveragePerson,
    CoverageStatus
} from "@/lib/coverage/types"

// ---------------------------------------------------------------------------
// Base email layout
// ---------------------------------------------------------------------------

interface EmailLayoutOptions {
    heading: string
    bodyHtml: string
    action?: string
    actionUrl?: string
}

function renderEmailHtml(opts: EmailLayoutOptions): string {
    const buttonHtml = opts.action
        ? `<div style="text-align:center;margin:24px 0;">
            <a href="${escapeHtml(opts.actionUrl ?? site.url)}" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(opts.action)}</a>
           </div>`
        : ""

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:24px 32px 16px;text-align:center;">
    <img src="${escapeHtml(site.url)}/logo.png" alt="${escapeHtml(site.shortName)}" width="48" height="48" style="display:inline-block;" />
  </td></tr>
  <tr><td style="padding:0 32px;">
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">${escapeHtml(opts.heading)}</h1>
    <div style="font-size:15px;line-height:1.6;color:#374151;">${opts.bodyHtml}</div>
    ${buttonHtml}
  </td></tr>
  <tr><td style="padding:24px 32px;font-size:12px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;">
    ${escapeHtml(site.name)} &bull; <a href="${escapeHtml(site.url)}" style="color:#9ca3af;">${escapeHtml(site.url)}</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

// ---------------------------------------------------------------------------
// Detail row helper (for roster assignment emails)
// ---------------------------------------------------------------------------

export function renderDetailRow(label: string, value: string): string {
    return `<div style="display:flex;justify-content:space-between;padding:3px 0;">
        <span style="color:#6b7280;">${escapeHtml(label)}</span>
        <span style="font-weight:600;text-align:right;">${escapeHtml(value)}</span>
    </div>`
}

export function renderDetailsBlock(rows: string[]): string {
    return `<div style="background-color:#f9fafb;border-radius:8px;padding:12px 16px;margin:12px 0;">${rows.join("")}</div>`
}

// ---------------------------------------------------------------------------
// Pre-built email bodies
// ---------------------------------------------------------------------------

export function buildSignupConfirmationHtml(opts: {
    firstName: string
    seasonLabel: string
    amountPaid: string
    receiptUrl?: string
}): string {
    const paymentLine =
        opts.amountPaid === "0"
            ? `<p>Thank you for registering for the ${escapeHtml(opts.seasonLabel)} season!</p>`
            : `<p>Thank you for registering for the ${escapeHtml(opts.seasonLabel)} season! Your payment of $${escapeHtml(opts.amountPaid)} has been received.</p>`

    return renderEmailHtml({
        heading: "Registration Confirmed!",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            ${paymentLine}
            <p>We'll be in touch with more details as the season approaches, including team assignments and the game schedule.</p>
            <p>If you have any questions, feel free to reach out to us at <a href="mailto:${escapeHtml(site.mailSupport)}">${escapeHtml(site.mailSupport)}</a>.</p>
        `,
        action: opts.receiptUrl ? "View Receipt" : "Go to Dashboard",
        actionUrl: opts.receiptUrl ?? `${site.url}/dashboard`
    })
}

export function buildRosterAssignmentHtml(opts: {
    firstName: string
    weekLabel: string
    seasonLabel: string
    introText: string
    detailBlocks: string[]
    footnote?: string
}): string {
    return renderEmailHtml({
        heading: `${opts.weekLabel} Roster Assignment`,
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>${escapeHtml(opts.introText)}</p>
            ${opts.detailBlocks.join("")}
            ${opts.footnote ? `<p style="font-size:13px;color:#6b7280;">${escapeHtml(opts.footnote)}</p>` : ""}
            <p>Questions? Reach out at <a href="mailto:${escapeHtml(site.mailSupport)}">${escapeHtml(site.mailSupport)}</a>.</p>
        `,
        action: "Go to Dashboard",
        actionUrl: `${site.url}/dashboard`
    })
}

export function buildRosterRemovalHtml(opts: {
    firstName: string
    weekLabel: string
    seasonLabel: string
}): string {
    return renderEmailHtml({
        heading: "Roster Update",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>We wanted to let you know that your ${escapeHtml(opts.weekLabel)} assignment for the ${escapeHtml(opts.seasonLabel)} season has been removed. If you have questions about this change, please reach out to us.</p>
            <p>If you believe this is an error, contact us at <a href="mailto:${escapeHtml(site.mailSupport)}">${escapeHtml(site.mailSupport)}</a>.</p>
        `,
        action: "Go to Dashboard",
        actionUrl: `${site.url}/dashboard`
    })
}

export function buildDraftResultHtml(opts: {
    firstName: string
    teamName: string
    divisionName: string
    captainNames: string[]
    seasonLabel: string
}): string {
    const captainLine =
        opts.captainNames.length > 0
            ? renderDetailRow(
                  opts.captainNames.length > 1 ? "Captains:" : "Captain:",
                  opts.captainNames.join(" & ")
              )
            : ""
    const detailRows = [
        renderDetailRow("Team:", opts.teamName),
        renderDetailRow("Division:", opts.divisionName),
        captainLine
    ].filter(Boolean)

    return renderEmailHtml({
        heading: "You've Been Drafted!",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>The ${escapeHtml(opts.seasonLabel)} draft is in — here's your team:</p>
            ${renderDetailsBlock(detailRows)}
            <p>Your captain will be in touch about the season. See you on the court!</p>
        `,
        action: "View Rosters",
        actionUrl: `${site.url}/dashboard/rosters`
    })
}

/**
 * A spot opened up and an admin approved this player off the waitlist. The
 * only thing standing between them and a roster spot is paying, so the CTA
 * goes straight to the signup wizard.
 */
export function buildWaitlistApprovedHtml(opts: {
    firstName: string
    seasonLabel: string
    amount: string
    isLatePricing: boolean
}): string {
    const detailRows = [
        renderDetailRow("Season:", opts.seasonLabel),
        renderDetailRow(
            "Season fee:",
            `$${opts.amount}${opts.isLatePricing ? " (late registration pricing)" : ""}`
        )
    ]

    return renderEmailHtml({
        heading: "A Spot Opened Up!",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>Good news — a spot has opened up for the ${escapeHtml(opts.seasonLabel)} season and you've been approved off the waitlist.</p>
            ${renderDetailsBlock(detailRows)}
            <p>Your spot isn't reserved until you complete your signup, and spots can fill quickly, so please sign up as soon as you can.</p>
        `,
        action: "Complete Your Signup",
        actionUrl: `${site.url}/dashboard/pay-season`
    })
}

/**
 * Survey invitation.
 *
 * The intro is prose an admin typed into the survey editor, so it is escaped
 * and split into paragraphs on blank lines rather than passed through as HTML:
 * the editor is a plain textarea, and treating its content as markup would
 * turn a stray angle bracket into an injection point.
 */
export function buildSurveyInvitationHtml(opts: {
    firstName: string
    title: string
    intro?: string | null
    closesLabel?: string | null
    isAnonymous: boolean
    surveyUrl: string
}): string {
    const introHtml = (opts.intro ?? "")
        .split(/\r?\n\s*\r?\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph !== "")
        .map(
            (paragraph) =>
                `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br />")}</p>`
        )
        .join("")

    return renderEmailHtml({
        heading: opts.title,
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            ${introHtml}
            ${opts.isAnonymous ? "<p>Your answers are anonymous.</p>" : ""}
            ${opts.closesLabel ? `<p>Please respond by ${escapeHtml(opts.closesLabel)}.</p>` : ""}
        `,
        action: "Take the survey",
        actionUrl: opts.surveyUrl
    })
}

/**
 * Follow-up nudge while a survey is still open. Unlike the invitation, this
 * carries no admin-authored intro — just the title and, if set, the deadline.
 */
export function buildSurveyReminderHtml(opts: {
    firstName: string
    title: string
    closesLabel?: string | null
    surveyUrl: string
}): string {
    return renderEmailHtml({
        heading: opts.title,
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>Just a reminder that this survey is still open and we haven't heard from you yet.</p>
            ${opts.closesLabel ? `<p>Please respond by ${escapeHtml(opts.closesLabel)}.</p>` : ""}
        `,
        action: "Take the survey",
        actionUrl: opts.surveyUrl
    })
}

export function buildAvailabilityChangeHtml(opts: {
    captainFirstName: string
    playerName: string
    teamName: string
    nowUnavailable: string[]
    nowAvailable: string[]
}): string {
    const listHtml = (label: string, events: string[]) =>
        events.length > 0
            ? `<p style="margin:8px 0 4px;font-weight:600;">${escapeHtml(label)}</p>
               <ul style="margin:0 0 8px;padding-left:20px;">${events.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`
            : ""

    return renderEmailHtml({
        heading: "Player Availability Update",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.captainFirstName)},</p>
            <p>${escapeHtml(opts.playerName)} on ${escapeHtml(opts.teamName)} just updated their availability:</p>
            ${listHtml("Now unavailable for:", opts.nowUnavailable)}
            ${listHtml("Now available for:", opts.nowAvailable)}
        `,
        action: "View Team Availability",
        actionUrl: `${site.url}/dashboard/team-availability`
    })
}

/**
 * Admin heads-up: a player already placed on a tryout roster has just marked
 * themselves unavailable for that night. One email covers every conflicting
 * week from a single availability save.
 */
export function buildTryoutRosterConflictHtml(opts: {
    adminFirstName: string
    playerName: string
    conflicts: Array<{
        weekLabel: string
        eventLabel: string
        placement: string
        editUrl: string
    }>
}): string {
    const items = opts.conflicts
        .map(
            (c) =>
                `<li style="margin:0 0 6px;"><strong>${escapeHtml(c.weekLabel)}</strong> — ${escapeHtml(c.eventLabel)}: ${escapeHtml(c.placement)} (<a href="${escapeHtml(c.editUrl)}">edit roster</a>)</li>`
        )
        .join("")

    return renderEmailHtml({
        heading: "Tryout Roster Conflict",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.adminFirstName)},</p>
            <p>${escapeHtml(opts.playerName)} just marked themselves unavailable for a tryout night they are already rostered for:</p>
            <ul style="margin:8px 0 12px;padding-left:20px;">${items}</ul>
            <p>Their slot is still on the roster and will show in red on the edit page until it is reassigned or removed.</p>
        `,
        action: "Open Roster Editor",
        actionUrl: opts.conflicts[0]?.editUrl ?? `${site.url}/dashboard`
    })
}

/**
 * Shared body for every sub-request lifecycle email (received, approved,
 * declined, cancelled, locked in) — the states differ only in heading, intro
 * sentence, detail rows, and an optional free-text note.
 */
export function buildSubRequestEmailHtml(opts: {
    firstName: string
    heading: string
    intro: string
    details: Array<{ label: string; value: string }>
    note?: string | null
    actionLabel?: string
}): string {
    return renderEmailHtml({
        heading: opts.heading,
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>${escapeHtml(opts.intro)}</p>
            ${renderDetailsBlock(
                opts.details.map((d) => renderDetailRow(d.label, d.value))
            )}
            ${opts.note ? `<p style="font-size:13px;color:#6b7280;">Note: ${escapeHtml(opts.note)}</p>` : ""}
        `,
        action: opts.actionLabel ?? "View Sub Requests",
        actionUrl: `${site.url}/dashboard/team-availability`
    })
}

export function buildFriendRequestHtml(opts: {
    firstName: string
    requesterName: string
}): string {
    return renderEmailHtml({
        heading: "New friend request",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p><strong>${escapeHtml(opts.requesterName)}</strong> sent you a friend request. Approve it to follow each other's schedules and results.</p>
        `,
        action: "View Friend Requests",
        actionUrl: `${site.url}/dashboard/friends`
    })
}

export function buildFriendAcceptedHtml(opts: {
    firstName: string
    accepterName: string
}): string {
    return renderEmailHtml({
        heading: "Friend request accepted",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p><strong>${escapeHtml(opts.accepterName)}</strong> accepted your friend request. You can now see each other's upcoming matches and results.</p>
        `,
        action: "View Friends",
        actionUrl: `${site.url}/dashboard/friends`
    })
}

export function buildGameReminderHtml(opts: {
    firstName: string
    role: "player" | "referee"
    dateLabel: string
    timeLabel: string
    courtLabel: string
    matchupLabel: string
    teamName: string | null
}): string {
    const intro =
        opts.role === "referee"
            ? "You're scheduled to referee a match tomorrow:"
            : `Your team${opts.teamName ? ` (${escapeHtml(opts.teamName)})` : ""} has a match tomorrow:`

    const detailRows = [
        renderDetailRow("Date:", opts.dateLabel),
        renderDetailRow("Time:", opts.timeLabel),
        renderDetailRow("Court:", opts.courtLabel),
        renderDetailRow("Matchup:", opts.matchupLabel)
    ]

    return renderEmailHtml({
        heading:
            opts.role === "referee" ? "Reffing Reminder" : "Game Day Tomorrow!",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>${intro}</p>
            ${renderDetailsBlock(detailRows)}
            <p style="font-size:12px;color:#9ca3af;">Don't want these reminders? <a href="${escapeHtml(site.publicUrl)}/dashboard/notifications" style="color:#9ca3af;">Manage your email preferences</a>.</p>
        `,
        action: "View Schedule",
        actionUrl: `${site.url}/dashboard/season-schedule`
    })
}

/**
 * One block per volunteer job, e.g.
 *   Tryout 1 — Thursday, September 10, 2026
 *   Job: Scorekeeper / When: 6:00 PM / Notes: ...
 */
export interface VolunteerJobBlock {
    nightLabel: string
    jobName: string
    timeLabel: string
    /** "Court 3" for per-court jobs; null when the job isn't tied to a court. */
    courtLabel: string | null
    notes: string | null
}

function renderVolunteerJobBlocks(jobs: VolunteerJobBlock[]): string {
    return jobs
        .map((job) =>
            renderDetailsBlock(
                [
                    renderDetailRow("When:", job.nightLabel),
                    renderDetailRow("Job:", job.jobName),
                    renderDetailRow("Time:", job.timeLabel),
                    job.courtLabel
                        ? renderDetailRow("Where:", job.courtLabel)
                        : "",
                    job.notes ? renderDetailRow("Notes:", job.notes) : ""
                ].filter(Boolean)
            )
        )
        .join("")
}

export function buildVolunteerJobAssignmentHtml(opts: {
    firstName: string
    seasonLabel: string
    jobs: VolunteerJobBlock[]
}): string {
    const plural = opts.jobs.length === 1 ? "job" : "jobs"

    return renderEmailHtml({
        heading: "Your Tryout Volunteer Assignment",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>Thank you for volunteering to help run ${escapeHtml(opts.seasonLabel)} tryouts! Here ${opts.jobs.length === 1 ? "is your" : "are your"} ${plural}:</p>
            ${renderVolunteerJobBlocks(opts.jobs)}
            <p style="font-size:13px;color:#6b7280;">Please plan to arrive 10 minutes early. If you can no longer make it, let us know as soon as you can at <a href="mailto:${escapeHtml(site.mailSupport)}">${escapeHtml(site.mailSupport)}</a>.</p>
        `,
        action: "Go to Dashboard",
        actionUrl: `${site.url}/dashboard`
    })
}

export function buildVolunteerJobReminderHtml(opts: {
    firstName: string
    dateLabel: string
    jobs: VolunteerJobBlock[]
}): string {
    return renderEmailHtml({
        heading: "Volunteering Tomorrow",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>A reminder that you're volunteering at tryouts tomorrow, ${escapeHtml(opts.dateLabel)}:</p>
            ${renderVolunteerJobBlocks(opts.jobs)}
            <p style="font-size:13px;color:#6b7280;">Please plan to arrive 10 minutes early.</p>
            <p style="font-size:12px;color:#9ca3af;">Don't want these reminders? <a href="${escapeHtml(site.publicUrl)}/dashboard/notifications" style="color:#9ca3af;">Manage your email preferences</a>.</p>
        `,
        action: "Go to Dashboard",
        actionUrl: `${site.url}/dashboard`
    })
}

// ---------------------------------------------------------------------------
// Sponsorship emails
// ---------------------------------------------------------------------------

/** To the sponsor contact when an admin sets up a sponsorship to be paid. */
export function buildSponsorshipPaymentDueHtml(opts: {
    firstName: string
    sponsorName: string
    amount: string
    seasonLabel: string
    payUrl: string
}): string {
    return renderEmailHtml({
        heading: "Your Sponsorship Is Ready to Pay",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>Thank you for supporting the league! We've set up <strong>${escapeHtml(opts.sponsorName)}</strong> as a sponsor for the ${escapeHtml(opts.seasonLabel)} season.</p>
            ${renderDetailsBlock([
                renderDetailRow("Sponsor", opts.sponsorName),
                renderDetailRow("Season", opts.seasonLabel),
                renderDetailRow("Amount due", `$${opts.amount}`)
            ])}
            <p>You can pay by card from your dashboard, where you can also update your business name, website, blurb, and logo for our sponsors page and the championship t-shirt.</p>
            <p>Paying by check instead? Reply to this email or reach us at <a href="mailto:${escapeHtml(site.mailSupport)}">${escapeHtml(site.mailSupport)}</a> and we'll mark it paid for you.</p>
        `,
        action: "Pay Sponsorship",
        actionUrl: opts.payUrl
    })
}

/** To admins when a sponsorship is paid (by card or marked manually). */
export function buildSponsorshipPaidHtml(opts: {
    adminFirstName: string
    sponsorName: string
    contactName: string
    amount: string
    method: "square" | "manual"
    note?: string | null
    manageUrl: string
}): string {
    const rows = [
        renderDetailRow("Sponsor", opts.sponsorName),
        renderDetailRow("Contact", opts.contactName),
        renderDetailRow("Amount", `$${opts.amount}`),
        renderDetailRow(
            "Paid via",
            opts.method === "square" ? "Card (Square)" : "Marked paid manually"
        )
    ]
    if (opts.note) {
        rows.push(renderDetailRow("Note", opts.note))
    }

    return renderEmailHtml({
        heading: "Sponsorship Paid",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.adminFirstName)},</p>
            <p><strong>${escapeHtml(opts.sponsorName)}</strong> has paid their season sponsorship.</p>
            ${renderDetailsBlock(rows)}
        `,
        action: "Manage Sponsors",
        actionUrl: opts.manageUrl
    })
}

/** Receipt to the payer after a card payment succeeds. */
export function buildSponsorshipReceiptHtml(opts: {
    firstName: string
    sponsorName: string
    seasonLabel: string
    amountPaid: string
    receiptUrl?: string
}): string {
    return renderEmailHtml({
        heading: "Sponsorship Payment Received",
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <p>Thank you! Your payment of $${escapeHtml(opts.amountPaid)} for <strong>${escapeHtml(opts.sponsorName)}</strong>'s ${escapeHtml(opts.seasonLabel)} sponsorship has been received.</p>
            <p>Your business will appear on our sponsors page and the championship t-shirt. You can update your logo and details from your dashboard at any time.</p>
            <p>If you have any questions, feel free to reach out to us at <a href="mailto:${escapeHtml(site.mailSupport)}">${escapeHtml(site.mailSupport)}</a>.</p>
        `,
        action: opts.receiptUrl ? "View Receipt" : "Go to Dashboard",
        actionUrl: opts.receiptUrl ?? `${site.url}/dashboard/sponsorship`
    })
}

export function buildConcernNotificationHtml(appUrl: string): string {
    return renderEmailHtml({
        heading: "New Concern Submitted",
        bodyHtml: `<p>A new concern has been submitted.</p>`,
        action: "View Concerns",
        actionUrl: `${appUrl}/dashboard/manage-concerns`
    })
}

/**
 * Sender + subject of an inbound message, for staff notifications.
 *
 * Only Manage Emails notifications carry these. Concern notifications stay
 * deliberately content-free — the concern inbox is far more sensitive, and
 * the notification is just a nudge to go look.
 */
export type InboundMessageSummary = {
    fromName?: string | null
    fromAddress?: string
    subject?: string
}

function renderInboundSummary(summary: InboundMessageSummary): string {
    const rows: string[] = []
    const name = summary.fromName?.trim()
    const sender = name
        ? summary.fromAddress
            ? `${name} <${summary.fromAddress}>`
            : name
        : summary.fromAddress
    if (sender) rows.push(renderDetailRow("From", sender))
    if (summary.subject) rows.push(renderDetailRow("Subject", summary.subject))
    return rows.length > 0 ? renderDetailsBlock(rows) : ""
}

export function buildInboundEmailNotificationHtml(
    opts: {
        appUrl: string
        ticketId: number
    } & InboundMessageSummary
): string {
    return renderEmailHtml({
        heading: "New Inbound Email Received",
        bodyHtml: `<p>A new email has been received and is awaiting review.</p>${renderInboundSummary(opts)}`,
        action: "View Email",
        actionUrl: `${opts.appUrl}/dashboard/manage-emails?email=${opts.ticketId}`
    })
}

export function buildThreadReplyNotificationHtml(
    opts: {
        appUrl: string
        ticketType: "email" | "concern"
        ticketId: number
    } & InboundMessageSummary
): string {
    const pageUrl =
        opts.ticketType === "email"
            ? `${opts.appUrl}/dashboard/manage-emails?email=${opts.ticketId}`
            : `${opts.appUrl}/dashboard/manage-concerns`

    const label = opts.ticketType === "email" ? "Email" : "Concern"
    // Concern threads never expose who wrote in or what about.
    const summary =
        opts.ticketType === "email" ? renderInboundSummary(opts) : ""

    return renderEmailHtml({
        heading: `New Reply on ${label} #${opts.ticketId}`,
        bodyHtml: `<p>A reply has been received on ${label} #${opts.ticketId}.</p>${summary}`,
        action: `View ${label} Thread`,
        actionUrl: pageUrl
    })
}

// ---------------------------------------------------------------------------
// Admin coverage digest
// ---------------------------------------------------------------------------

const COVERAGE_BANNER: Record<
    CoverageStatus,
    { bg: string; fg: string; title: string }
> = {
    green: { bg: "#dcfce7", fg: "#166534", title: "Covered" },
    yellow: { bg: "#fef3c7", fg: "#92400e", title: "Gaps mid-night" },
    red: { bg: "#fee2e2", fg: "#991b1b", title: "Setup or cleanup uncovered" }
}

const COVERAGE_SOURCE_LABEL: Record<CoveragePerson["sources"][number], string> =
    {
        play: "playing",
        work: "working",
        ref: "reffing",
        present: "present"
    }

function renderCoveragePerson(p: CoveragePerson): string {
    const tags = p.sources.map((s) =>
        s === "present" && p.note
            ? `present: ${p.note}`
            : COVERAGE_SOURCE_LABEL[s]
    )
    if (p.unavailable) tags.push("unavailable")
    if (p.isLeadership) tags.push("leadership")
    if (!p.counts && !p.isLeadership && !p.unavailable) {
        tags.push("not an admin")
    }
    const style = p.counts
        ? "font-weight:600;"
        : `color:#6b7280;${p.unavailable ? "text-decoration:line-through;" : ""}`
    return `<span style="${style}">${escapeHtml(p.name)}</span> <span style="color:#6b7280;font-size:13px;">(${escapeHtml(tags.join(", "))})</span>`
}

export function buildCoverageDigestHtml(opts: {
    firstName: string
    day: CoverageDate
    coverageUrl: string
}): string {
    const { day } = opts
    const banner = COVERAGE_BANNER[day.status]
    const dateLabel = `${formatCoverageDate(day.date)} · ${coverageDateTitle(day)}`
    const rows = day.slots
        .map((slot) => {
            const people =
                slot.people.length === 0
                    ? `<span style="color:#991b1b;">— nobody —</span>`
                    : slot.people.map(renderCoveragePerson).join("<br/>")
            return `<tr>
                <td style="padding:8px 12px;border-top:1px solid #e5e7eb;white-space:nowrap;vertical-align:top;font-weight:600;">${escapeHtml(formatSlotLabel(slot.startTime))}<br/><span style="font-weight:400;color:#6b7280;font-size:12px;">${slot.matchCount} match${slot.matchCount === 1 ? "" : "es"}</span></td>
                <td style="padding:8px 12px;border-top:1px solid #e5e7eb;vertical-align:top;">${people}</td>
            </tr>`
        })
        .join("")

    return renderEmailHtml({
        heading: `Coverage for ${dateLabel}`,
        bodyHtml: `
            <p>Hi ${escapeHtml(opts.firstName)},</p>
            <div style="background-color:${banner.bg};color:${banner.fg};border-radius:8px;padding:12px 16px;margin:12px 0;">
                <strong>${escapeHtml(banner.title)}</strong> — ${escapeHtml(day.reason)}
            </div>
            <p>Here is who is at the gym on ${escapeHtml(formatCoverageDate(day.date))}. Only admins count toward coverage; leadership members are listed for information.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">${rows}</table>
            <p style="font-size:13px;color:#6b7280;">Can you fill a gap? Add yourself on the Coverage page.</p>
        `,
        action: "Open Coverage",
        actionUrl: opts.coverageUrl
    })
}
