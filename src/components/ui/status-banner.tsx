import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const VARIANT_CLASSES = {
    error: "rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200",
    success:
        "rounded-md bg-green-50 p-4 text-green-800 dark:bg-green-950 dark:text-green-200",
    warning:
        "rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
    info: "rounded-md bg-muted p-4 text-muted-foreground"
} as const

export type StatusBannerVariant = keyof typeof VARIANT_CLASSES

export function StatusBanner({
    variant = "info",
    className,
    children
}: {
    variant?: StatusBannerVariant
    className?: string
    children: ReactNode
}) {
    return (
        <div className={cn(VARIANT_CLASSES[variant], className)}>
            {children}
        </div>
    )
}
