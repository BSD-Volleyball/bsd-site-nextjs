import { cn } from "@/lib/utils"

interface WaiverContentProps {
    content: string
    className?: string
}

// Renders waiver prose in the same scrollable container used across the app.
// Paragraphs are split on blank lines so DB content can carry whatever spacing
// admins author. Pass `className` to override the wrapper (e.g. taller box).
export function WaiverContent({ content, className }: WaiverContentProps) {
    const paragraphs = content
        .split(/\n\s*\n/)
        .filter((p) => p.trim().length > 0)

    return (
        <div
            className={cn(
                "max-h-64 overflow-y-auto rounded-lg border p-4 text-muted-foreground text-sm leading-relaxed",
                className
            )}
        >
            {paragraphs.map((p, i) => (
                <p key={i} className={i === 0 ? undefined : "mt-4"}>
                    {p}
                </p>
            ))}
        </div>
    )
}
