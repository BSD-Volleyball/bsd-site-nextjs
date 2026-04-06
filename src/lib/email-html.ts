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

export function renderEmailHtml(opts: EmailLayoutOptions): string {
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
    from: string
    subject: string
}): string {
    return renderEmailHtml({
        heading: "New Inbound Email Received",
        bodyHtml: `
            <p>A new email has been received.</p>
            <p><strong>From:</strong> ${escapeHtml(opts.from)}</p>
            <p><strong>Subject:</strong> ${escapeHtml(opts.subject)}</p>
        `,
        action: "View Emails",
        actionUrl: `${opts.appUrl}/dashboard/manage-emails`
    })
}

export function buildThreadReplyNotificationHtml(opts: {
    appUrl: string
    ticketType: "email" | "concern"
    ticketId: number
    subject: string
    from: string
    bodyPreview: string | null
}): string {
    const pageUrl =
        opts.ticketType === "email"
            ? `${opts.appUrl}/dashboard/manage-emails`
            : `${opts.appUrl}/dashboard/manage-concerns`

    const label = opts.ticketType === "email" ? "Email" : "Concern"
    const preview = opts.bodyPreview
        ? escapeHtml(opts.bodyPreview.slice(0, 300)) +
          (opts.bodyPreview.length > 300 ? "…" : "")
        : "(no body)"

    return renderEmailHtml({
        heading: `New Reply on ${label} #${opts.ticketId}`,
        bodyHtml: `
            <p>A reply has been received on ${label} #${opts.ticketId}.</p>
            <p><strong>From:</strong> ${escapeHtml(opts.from)}</p>
            <p><strong>Subject:</strong> ${escapeHtml(opts.subject)}</p>
            <blockquote style="border-left:3px solid #d1d5db;margin:12px 0;padding:8px 16px;color:#6b7280;font-size:14px;">${preview}</blockquote>
        `,
        action: `View ${label} Thread`,
        actionUrl: pageUrl
    })
}
