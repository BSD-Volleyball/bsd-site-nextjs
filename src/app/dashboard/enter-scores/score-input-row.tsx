"use client"

export function ScoreInputRow({
    label,
    homeValue,
    awayValue,
    onHomeChange,
    onAwayChange,
    optional = false,
    bold = false,
    topBorder = false,
    disabled = false
}: {
    label: string
    homeValue: string
    awayValue: string
    onHomeChange: (value: string) => void
    onAwayChange: (value: string) => void
    optional?: boolean
    bold?: boolean
    topBorder?: boolean
    disabled?: boolean
}) {
    const inputClassFor = (value: string) => {
        if (disabled) {
            return "cursor-not-allowed border-muted bg-muted/40 text-muted-foreground"
        }
        if (value !== "") {
            return "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/40"
        }
        if (optional) {
            return "bg-background"
        }
        return "border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/40"
    }

    return (
        <tr className={topBorder ? "border-t-2" : ""}>
            <td
                className={`py-1.5 pr-3 ${bold ? "font-semibold" : "text-muted-foreground"} ${optional ? "italic" : ""}`}
            >
                {label}
            </td>
            <td className="py-1.5 text-center">
                <input
                    type="number"
                    min={0}
                    disabled={disabled}
                    className={`h-8 w-20 rounded-md border px-2 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${inputClassFor(homeValue)}`}
                    value={homeValue}
                    onChange={(e) => onHomeChange(e.target.value)}
                    placeholder={optional ? "—" : ""}
                />
            </td>
            <td className="py-1.5 text-center text-muted-foreground text-xs">
                -
            </td>
            <td className="py-1.5 text-center">
                <input
                    type="number"
                    min={0}
                    disabled={disabled}
                    className={`h-8 w-20 rounded-md border px-2 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${inputClassFor(awayValue)}`}
                    value={awayValue}
                    onChange={(e) => onAwayChange(e.target.value)}
                    placeholder={optional ? "—" : ""}
                />
            </td>
        </tr>
    )
}
