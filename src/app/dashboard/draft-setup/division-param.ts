/** Parse `?divisionId=` into a positive integer, or undefined when absent/bad. */
export function parseDivisionIdParam(raw?: string): number | undefined {
    if (!raw) return undefined
    const parsed = parseInt(raw, 10)
    return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed
}
