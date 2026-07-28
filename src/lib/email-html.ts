/**
 * email-html.ts — HTML email rendering utilities for non-auth emails.
 *
 * All non-auth transactional emails are rendered as HTML strings using these
 * helpers. The base layout includes the BSD logo header, content area, and
 * optional CTA button, matching the style of the better-auth EmailTemplate.
 */

import { site } from "@/config/site"

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

export function buildConcernNotificationHtml(appUrl: string): string {
    return renderEmailHtml({
        heading: "New Concern Submitted",
        bodyHtml: `<p>A new concern has been submitted.</p>`,
        action: "View Concerns",
        actionUrl: `${appUrl}/dashboard/manage-concerns`
    })
}

export function buildInboundEmailNotificationHtml(opts: {
    appUrl: string
}): string {
    return renderEmailHtml({
        heading: "New Inbound Email Received",
        bodyHtml: `<p>A new email has been received and is awaiting review.</p>`,
        action: "View Emails",
        actionUrl: `${opts.appUrl}/dashboard/manage-emails`
    })
}

export function buildThreadReplyNotificationHtml(opts: {
    appUrl: string
    ticketType: "email" | "concern"
    ticketId: number
}): string {
    const pageUrl =
        opts.ticketType === "email"
            ? `${opts.appUrl}/dashboard/manage-emails`
            : `${opts.appUrl}/dashboard/manage-concerns`

    const label = opts.ticketType === "email" ? "Email" : "Concern"

    return renderEmailHtml({
        heading: `New Reply on ${label} #${opts.ticketId}`,
        bodyHtml: `<p>A reply has been received on ${label} #${opts.ticketId}.</p>`,
        action: `View ${label} Thread`,
        actionUrl: pageUrl
    })
}
