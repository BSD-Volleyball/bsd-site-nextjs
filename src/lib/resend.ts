import { Resend } from "resend"

/**
 * Shared Resend client instance.
 * Import this instead of creating `new Resend()` in each file.
 */
export const resend = new Resend(process.env.RESEND_API_KEY)
