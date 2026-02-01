const site_url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const site = {
  name: "Bump Set Drink Volleyball",
  shortName: "BSD",
  description: "A recreational co-ed volleyball league in the Washington DC metro area. Join us for competitive play, meet new people, and have fun!",
  url: site_url,
  ogImage: `${site_url}/og.jpg`,
  logo: "/logo.svg",
  mailSupport: "info@bumpsetdrink.com",
  mailFrom: process.env.MAIL_FROM || "noreply@mail.bumpsetdrink.com",
  links: {
    soccerplex: "https://www.mdsoccerplex.org",
    facebook: "https://www.facebook.com/bumpsetdrink",
  }
} as const;