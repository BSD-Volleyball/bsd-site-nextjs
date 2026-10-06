import { z } from "zod"

// ---------------------------------------------------------------------------
// Postmark Inbound Email Payload (subset of fields we use)
// https://postmarkapp.com/developer/webhooks/inbound-webhook
// ---------------------------------------------------------------------------

// Payloads are parsed, not cast. The schemas are deliberately lenient (only
// fields this route reads, extra fields kept, blanks tolerated) because a
// rejected inbound message is a lost email; a payload that still fails is
// answered 400 so it stays in Postmark's activity for a manual retry.
export const postmarkHeaderSchema = z.object({
    Name: z.string(),
    Value: z.string()
})
export type PostmarkHeader = z.infer<typeof postmarkHeaderSchema>

const postmarkAddressSchema = z.looseObject({
    Email: z.string(),
    Name: z.string().nullish()
})

export const postmarkInboundSchema = z.looseObject({
    MessageID: z.string().min(1),
    From: z.string(),
    FromName: z.string().nullish(),
    FromFull: postmarkAddressSchema.nullish(),
    To: z
        .string()
        .nullish()
        .transform((to) => to ?? ""),
    ToFull: z.array(postmarkAddressSchema).nullish(),
    Subject: z.string().nullish(),
    TextBody: z.string().nullish(),
    HtmlBody: z.string().nullish(),
    Headers: z.array(postmarkHeaderSchema).nullish(),
    /** Base64-encoded raw RFC 2822 email. Present when "Include raw email" is enabled on the inbound stream. */
    RawEmail: z.string().nullish(),
    /** Base64-inline attachments; empty array when the message has none. */
    Attachments: z
        .array(
            z.looseObject({
                Name: z.string(),
                Content: z.string(),
                ContentType: z.string(),
                ContentLength: z.number(),
                ContentID: z.string().nullish()
            })
        )
        .nullish()
})
export type PostmarkInboundPayload = z.infer<typeof postmarkInboundSchema>

// https://postmarkapp.com/developer/webhooks/subscription-change-webhook
export const postmarkSubscriptionChangeSchema = z.looseObject({
    RecordType: z.literal("SubscriptionChange"),
    MessageStream: z.string(),
    Recipient: z.string(),
    SuppressSending: z.boolean(),
    SuppressionReason: z.string().nullish(),
    Origin: z.string().nullish(),
    Timestamp: z.string().nullish()
})
export type PostmarkSubscriptionChangePayload = z.infer<
    typeof postmarkSubscriptionChangeSchema
>

// https://postmarkapp.com/developer/webhooks/bounce-webhook
export const postmarkBounceSchema = z.looseObject({
    RecordType: z.literal("Bounce"),
    MessageStream: z.string(),
    Type: z.string(), // e.g. 'HardBounce', 'SoftBounce', 'Transient'
    Email: z.string(),
    BouncedAt: z.string().nullish(),
    Description: z.string().nullish()
})
export type PostmarkBouncePayload = z.infer<typeof postmarkBounceSchema>

// https://postmarkapp.com/developer/webhooks/spam-complaint-webhook
export const postmarkSpamComplaintSchema = z.looseObject({
    RecordType: z.literal("SpamComplaint"),
    MessageStream: z.string(),
    Email: z.string(),
    BouncedAt: z.string().nullish()
})
export type PostmarkSpamComplaintPayload = z.infer<
    typeof postmarkSpamComplaintSchema
>
