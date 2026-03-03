import type { MetadataRoute } from "next"
import { site } from "@/config/site"

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = site.url

    return [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 1
        },
        {
            url: `${baseUrl}/spring-2026-season-info`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.8
        },
        {
            url: `${baseUrl}/faq`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.6
        },
        {
            url: `${baseUrl}/captain-expectations`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.6
        },
        {
            url: `${baseUrl}/referee-expectations`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.6
        },
        {
            url: `${baseUrl}/player-experience`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.5
        },
        {
            url: `${baseUrl}/history`,
            lastModified: new Date(),
            changeFrequency: "yearly",
            priority: 0.4
        },
        {
            url: `${baseUrl}/gender-policy`,
            lastModified: new Date(),
            changeFrequency: "yearly",
            priority: 0.4
        }
    ]
}
