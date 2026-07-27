import { serializeCsvField } from "@/lib/utils"

/**
 * Join CSV headers + rows into a single CRLF-delimited CSV string,
 * escaping each field with serializeCsvField.
 */
export function buildCsvContent(headers: string[], rows: unknown[][]): string {
    return [headers, ...rows]
        .map((row) => row.map((value) => serializeCsvField(value)).join(","))
        .join("\r\n")
}

/**
 * Build a `<prefix>-<label-slug>-<yyyy-mm-dd>.csv` filename.
 */
export function buildTimestampedCsvFilename(
    prefix: string,
    label: string
): string {
    const slug = label.toLowerCase().replace(/\s+/g, "-")
    const timestamp = new Date().toISOString().split("T")[0]
    return `${prefix}-${slug}-${timestamp}.csv`
}

/**
 * Client-side CSV download: wraps the content in a UTF-8 BOM Blob and
 * triggers a browser download via a temporary anchor element.
 */
export function downloadCsv(csvContent: string, filename: string): void {
    const blob = new Blob([`\ufeff${csvContent}`], {
        type: "text/csv;charset=utf-8;"
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename

    document.body.appendChild(link)
    link.click()

    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}
