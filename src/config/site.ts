const site_url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

export const site = {
    name: "Bump Set Drink Volleyball",
    shortName: "BSD",
    description:
        "A recreational co-ed volleyball league in the Washington DC metro area. Join us for competitive play, meet new people, and have fun!",
    url: site_url,
    // Absolute origin for user-facing links baked into emails and webhook
    // replies. Unlike `url` (dev-friendly localhost fallback), this must
    // never point at localhost, so it falls back to the production domain.
    publicUrl: process.env.NEXT_PUBLIC_APP_URL || "https://bumpsetdrink.com",
    ogImage: `${site_url}/og.jpg`,
    logo: "/logo.svg",
    mailSupport: "info@bumpsetdrink.com",
    // Falls back to the apex domain, which is the only one that authenticates:
    // it carries the SPF record, Postmark's DKIM signs as bumpsetdrink.com, and
    // pm-bounces.bumpsetdrink.com provides the aligned Return-Path. The previous
    // fallback (mail.bumpsetdrink.com) does not resolve at all, so a missing
    // MAIL_FROM would have sent every email from an unauthenticated domain.
    mailFrom: `Bump Set Drink <${process.env.MAIL_FROM || "info@bumpsetdrink.com"}>`,
    links: {
        soccerplex: "https://www.mdsoccerplex.org",
        facebook: "https://www.facebook.com/bumpsetdrink",
        // Avery 5164 shipping labels used for tryout nametag printing
        avery5164Labels: "https://www.amazon.com/dp/B0BCFNZJK6"
    }
} as const
