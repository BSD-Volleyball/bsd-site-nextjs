"use client"

import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { ListNode, ListItemNode } from "@lexical/list"
import type { LexicalEmailTemplateContent } from "@/lib/email-template-content"
import { TemplateVariableNode } from "@/components/email-template/nodes/template-variable-node"
import type { TemplateVariableValues } from "@/lib/email-template-variables"
import { resolveTemplateVariablesInContent } from "@/lib/email-template-variables"

interface LexicalEmailPreviewProps {
    content: LexicalEmailTemplateContent
    variableValues?: TemplateVariableValues
}

export function LexicalEmailPreview({
    content,
    variableValues
}: LexicalEmailPreviewProps) {
    const resolvedContent = variableValues
        ? resolveTemplateVariablesInContent(content, variableValues)
        : content

    return (
        <div className="rounded-md bg-muted p-3">
            <LexicalComposer
                initialConfig={{
                    namespace: "email-template-preview",
                    editorState: JSON.stringify(resolvedContent),
                    editable: false,
                    nodes: [ListNode, ListItemNode, TemplateVariableNode],
                    onError(error) {
                        throw error
                    }
                }}
            >
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm outline-none [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6" />
                    }
                    placeholder={null}
                    ErrorBoundary={LexicalErrorBoundary}
                />
            </LexicalComposer>
        </div>
    )
}
