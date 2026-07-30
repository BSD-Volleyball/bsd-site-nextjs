// Low-level helpers for the archived site's <br>-STACKED tables.
//
// Several generations of the site packed multiple records into a single table
// row: one <tr> covers a whole play date, and every <td> in it holds a
// parallel list of values separated by <br>, one per match:
//
//     <td>1<br>2<br>3</td>            <- match numbers
//     <td>Stump<br>Lu<br>Finver</td>  <- winners
//
// Reading such a row means splitting each cell and zipping the columns
// index-wise. Both the playoff tables and the 2008-2012 standings pages use
// this shape, so the mechanics live here rather than being written twice.

export function clean(html: string): string {
    return html
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim()
}

export function tablesOf(html: string): string[] {
    return [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map(
        (m) => m[1]
    )
}

export function rowsOf(tableHtml: string): string[] {
    return [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(
        (m) => m[1]
    )
}

/** Raw inner HTML of each cell, so callers can still see <br> boundaries. */
export function cellsOf(rowHtml: string): string[] {
    return [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
        (m) => m[1]
    )
}

/** Plain text of each cell. */
export function textCellsOf(rowHtml: string): string[] {
    return cellsOf(rowHtml).map(clean)
}

/**
 * Split one cell into its <br>-separated values.
 *
 * Trailing blanks are dropped: the archived markup habitually ends a cell with
 * "<br>\n</font>", which would otherwise inflate the row's apparent depth and
 * invent an extra empty record.
 */
export function stack(cellHtml: string): string[] {
    const parts = cellHtml.split(/<br\s*\/?>/i).map(clean)
    while (parts.length > 0 && parts[parts.length - 1] === "") {
        parts.pop()
    }
    return parts
}

/**
 * Transpose one stacked row into `depth` records.
 *
 * A column holding exactly one value is broadcast to every record -- that is
 * how a single Date cell applies to all four matches played that evening.
 */
export function transposeRow(rowHtml: string): string[][] {
    const columns = cellsOf(rowHtml).map(stack)
    if (columns.length === 0) {
        return []
    }

    const depth = Math.max(...columns.map((c) => c.length))
    const records: string[][] = []

    for (let i = 0; i < depth; i++) {
        records.push(
            columns.map((column) => {
                if (column.length === 1) {
                    return column[0]
                }
                return column[i] ?? ""
            })
        )
    }

    return records
}

export function toInt(value: string): number | null {
    const match = value.match(/-?\d+/)
    return match ? Number.parseInt(match[0], 10) : null
}

export function normalizeSurname(value: string): string {
    return value.toLowerCase().replace(/[^a-z]/g, "")
}

function editDistance(a: string, b: string): number {
    if (a === b) {
        return 0
    }
    const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
        let diagonal = previous[0]
        previous[0] = i
        for (let j = 1; j <= b.length; j++) {
            const current = previous[j]
            previous[j] = Math.min(
                previous[j] + 1,
                previous[j - 1] + 1,
                diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
            )
            diagonal = current
        }
    }
    return previous[b.length]
}

/**
 * Resolve a captain surname against a known set, tolerating typos.
 *
 * The standings table and the results table on the SAME page sometimes spell a
 * captain differently -- Fall 2010 A has "Villaneuva" in one and "Villanueva"
 * in the other; Spring 2013 A has both "Pessagno" and "Passagno". Requiring an
 * exact match drops every one of that team's results on the floor.
 *
 * A near match is only accepted when it is unambiguous: exactly one candidate
 * within the distance budget. Anything else returns null rather than guessing,
 * because attributing a match to the wrong team is far worse than skipping it.
 */
export function resolveSurname<T>(
    surname: string,
    candidates: Map<string, T>
): T | null {
    const key = normalizeSurname(surname)
    if (!key) {
        return null
    }

    const exact = candidates.get(key)
    if (exact !== undefined) {
        return exact
    }

    // One edit for short names, two once there is enough length for the budget
    // not to collapse distinct surnames together.
    const budget = key.length >= 8 ? 2 : 1
    const near: T[] = []
    for (const [candidate, value] of candidates) {
        if (Math.abs(candidate.length - key.length) > budget) {
            continue
        }
        if (editDistance(key, candidate) <= budget) {
            near.push(value)
        }
    }

    return near.length === 1 ? near[0] : null
}
