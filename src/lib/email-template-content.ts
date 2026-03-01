export interface LexicalTextNode {
    detail: number
    format: number
    mode: string
    style: string
    text: string
    type: "text"
    version: number
}

export interface LexicalTemplateVariableNode {
    type: "template-variable"
    variableKey: string
    version: number
}

export type LexicalInlineNode = LexicalTextNode | LexicalTemplateVariableNode

export interface LexicalParagraphNode {
    children: LexicalInlineNode[]
    direction: null
    format: string
    indent: number
    type: "paragraph"
    version: number
}

export interface LexicalListItemNode {
    children: LexicalInlineNode[]
    direction: null
    format: string
    indent: number
    type: "listitem"
    version: number
    value: number
    checked?: boolean
}

export interface LexicalListNode {
    children: LexicalListItemNode[]
    direction: null
    format: string
    indent: number
    type: "list"
    version: number
    listType: string
    start: number
    tag: string
}

export type LexicalRootChild = LexicalParagraphNode | LexicalListNode

export interface LexicalRootNode {
    children: LexicalRootChild[]
    direction: null
    format: string
    indent: number
    type: "root"
    version: number
}

export interface LexicalEmailTemplateContent {
    root: LexicalRootNode
}

export function createLexicalContentFromPlainText(
    value: string
): LexicalEmailTemplateContent {
    const normalized = value.replace(/\r\n/g, "\n")
    const paragraphs = normalized
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph.length > 0)

    const children: LexicalParagraphNode[] =
        paragraphs.length > 0
            ? paragraphs.map((paragraph) => ({
                  type: "paragraph" as const,
                  direction: null,
                  format: "",
                  indent: 0,
                  version: 1,
                  children: [
                      {
                          type: "text" as const,
                          detail: 0,
                          format: 0,
                          mode: "normal",
                          style: "",
                          text: paragraph,
                          version: 1
                      }
                  ]
              }))
            : [
                  {
                      type: "paragraph" as const,
                      direction: null,
                      format: "",
                      indent: 0,
                      version: 1,
                      children: [
                          {
                              type: "text" as const,
                              detail: 0,
                              format: 0,
                              mode: "normal",
                              style: "",
                              text: "",
                              version: 1
                          }
                      ]
                  }
              ]

    return {
        root: {
            type: "root",
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children
        }
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

export function isLexicalEmailTemplateContent(
    value: unknown
): value is LexicalEmailTemplateContent {
    if (!isObject(value)) {
        return false
    }

    if (!isObject(value.root)) {
        return false
    }

    return value.root.type === "root" && Array.isArray(value.root.children)
}

export function normalizeEmailTemplateContent(
    value: unknown
): LexicalEmailTemplateContent {
    if (isLexicalEmailTemplateContent(value)) {
        return value
    }

    if (typeof value === "string") {
        const trimmed = value.trim()

        if (trimmed.startsWith("{")) {
            try {
                const parsed = JSON.parse(trimmed)
                if (isLexicalEmailTemplateContent(parsed)) {
                    return parsed
                }
            } catch {
                return createLexicalContentFromPlainText(value)
            }
        }

        return createLexicalContentFromPlainText(value)
    }

    return createLexicalContentFromPlainText("")
}

function getInlineNodeText(node: unknown): string {
    if (!isObject(node)) return ""
    if (
        node.type === "template-variable" &&
        typeof node.variableKey === "string"
    ) {
        return `[${node.variableKey}]`
    }
    if (typeof node.text === "string") {
        return node.text
    }
    return ""
}

function getTextFromParagraph(paragraph: unknown): string {
    if (!isObject(paragraph) || !Array.isArray(paragraph.children)) {
        return ""
    }

    const parts = paragraph.children.map((node) => {
        if (!isObject(node)) return ""

        // list node — recurse into list items
        if (node.type === "list" && Array.isArray(node.children)) {
            return node.children
                .map((item) => {
                    if (!isObject(item) || !Array.isArray(item.children))
                        return ""
                    return item.children.map(getInlineNodeText).join("")
                })
                .join("\n")
        }

        // list item inline children
        if (Array.isArray(node.children)) {
            return (node.children as unknown[]).map(getInlineNodeText).join("")
        }

        return getInlineNodeText(node)
    })

    return parts.join("")
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function textNodeToHtml(node: LexicalTextNode): string {
    let html = escapeHtml(node.text).replace(/\n/g, "<br>")
    if (node.format & 1) html = `<strong>${html}</strong>`
    if (node.format & 2) html = `<em>${html}</em>`
    if (node.format & 8) html = `<u>${html}</u>`
    if (node.format & 4) html = `<s>${html}</s>`
    return html
}

function inlineNodeToHtml(node: LexicalInlineNode): string {
    if (node.type === "template-variable") {
        return escapeHtml(`[${node.variableKey}]`)
    }
    return textNodeToHtml(node)
}

function listItemToHtml(item: LexicalListItemNode): string {
    return `<li>${item.children.map(inlineNodeToHtml).join("")}</li>`
}

export function convertEmailTemplateContentToHtml(
    content: LexicalEmailTemplateContent
): string {
    return content.root.children
        .map((child) => {
            if (child.type === "list") {
                const tag = child.listType === "number" ? "ol" : "ul"
                return `<${tag}>${child.children.map(listItemToHtml).join("")}</${tag}>`
            }
            const inner = child.children.map(inlineNodeToHtml).join("")
            return `<p>${inner || "<br>"}</p>`
        })
        .join("")
}

export function extractPlainTextFromEmailTemplateContent(
    value: unknown
): string {
    const normalized = normalizeEmailTemplateContent(value)

    const lines = normalized.root.children.map((child) => {
        if (child.type === "list") {
            return child.children
                .map(
                    (item) =>
                        `• ${item.children.map(getInlineNodeText).join("")}`
                )
                .join("\n")
        }
        return getTextFromParagraph(child)
    })

    return lines.join("\n\n").trim()
}
