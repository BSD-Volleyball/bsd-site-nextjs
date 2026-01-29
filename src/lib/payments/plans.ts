export interface Plan {
    id: number
    name: string
    catalogItemVariationId: string // Square Catalog Item Variation ID
    limits: {
        tokens: number
    }
    features: string[]
    price: number
    trialDays: number
}

export const plans: Plan[] = [
    {
        id: 1,
        name: "basic",
        catalogItemVariationId: process.env.SQUARE_BASIC_PLAN_VARIATION_ID || "SQUARE_BASIC_PLAN_VARIATION_ID",
        limits: {
            tokens: 100
        },
        features: [
            "Up to 3 projects",
            "Basic analytics",
            "Email support",
            "1 GB storage"
        ],
        price: 9.99,
        trialDays: 0
    },
    {
        id: 2,
        name: "pro",
        catalogItemVariationId: process.env.SQUARE_PRO_PLAN_VARIATION_ID || "SQUARE_PRO_PLAN_VARIATION_ID",
        limits: {
            tokens: 300
        },
        features: [
            "Gives you access to pro features!",
            "Upto 10 team members",
            "Upto 20 GB storage",
            "Upto 10 pages",
            "Phone & email support",
            "AI assistance"
        ],
        price: 29.99,
        trialDays: 0
    },
    {
        id: 3,
        name: "Premium",
        catalogItemVariationId: process.env.SQUARE_PREMIUM_PLAN_VARIATION_ID || "SQUARE_PREMIUM_PLAN_VARIATION_ID",
        limits: {
            tokens: 900
        },
        features: [
            "Unlimited projects",
            "Advanced analytics",
            "Priority support",
            "100 GB storage"
        ],
        price: 59.99,
        trialDays: 7
    }
]
