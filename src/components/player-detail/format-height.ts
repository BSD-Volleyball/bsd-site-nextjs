export function formatHeight(inches: number | null): string {
    if (!inches) return "\u2014"
    const numericInches = Number(inches)
    if (!Number.isFinite(numericInches)) return "\u2014"

    const feet = Math.floor(numericInches / 12)
    const remainingInches = numericInches % 12
    return `${feet}'${remainingInches}"`
}
