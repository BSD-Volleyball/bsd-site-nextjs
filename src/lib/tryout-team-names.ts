/**
 * Drink names for Tryout 2 / Tryout 3 teams.
 *
 * "Bump Set Drink" historically named preseason teams after drinks
 * (2015–2023). Names run alphabetically from AA-1 through BB-4:
 * single-word names with unique first letters A–X cover AA, A, ABA and
 * ABB; BBB and BB use two-word names (alphabetical within each division).
 *
 * The `AA-1` code is never stored — it is `division.name + "-" + team_number`
 * — so these names are a pure lookup keyed the same way.
 */
export const TRYOUT_TEAM_NAMES: Record<string, readonly string[]> = {
    AA: ["Absinthe", "Bourbon", "Cosmo", "Daiquiri", "Everclear", "Fireball"],
    A: ["Gin", "Hurricane", "IPA", "Jameson", "Kahlua", "Limoncello"],
    ABA: ["Margarita", "Negroni", "Ouzo", "Paloma", "Quaff", "Rum"],
    ABB: ["Sazerac", "Tequila", "Ultra", "Vodka", "Whiskey", "XO"],
    BBB: [
        "Bloody Mary",
        "Eagle Rare",
        "Hot Toddy",
        "Long Island",
        "Moscow Mule",
        "Old Fashioned"
    ],
    BB: ["Piña Colada", "Rusty Nail", "Sea Breeze", "White Russian"]
}

/** Drink name for a tryout team, or null when none is defined. */
export function getTryoutTeamName(
    divisionName: string,
    teamNumber: number
): string | null {
    return TRYOUT_TEAM_NAMES[divisionName]?.[teamNumber - 1] ?? null
}

/** Short code, e.g. "AA-1". */
export function tryoutTeamCode(divisionName: string, teamNumber: number) {
    return `${divisionName}-${teamNumber}`
}

/** "Absinthe (AA-1)", falling back to "AA-1" when no drink name exists. */
export function formatTryoutTeamLabel(
    divisionName: string,
    teamNumber: number
): string {
    const code = tryoutTeamCode(divisionName, teamNumber)
    const name = getTryoutTeamName(divisionName, teamNumber)
    return name ? `${name} (${code})` : code
}

/** "Absinthe vs. Bourbon (AA-1 vs. AA-2)", falling back to codes only. */
export function formatTryoutMatchLabel(
    divisionName: string,
    homeTeam: number,
    awayTeam: number
): string {
    const codes = `${tryoutTeamCode(divisionName, homeTeam)} vs. ${tryoutTeamCode(divisionName, awayTeam)}`
    const home = getTryoutTeamName(divisionName, homeTeam)
    const away = getTryoutTeamName(divisionName, awayTeam)
    return home && away ? `${home} vs. ${away} (${codes})` : codes
}
