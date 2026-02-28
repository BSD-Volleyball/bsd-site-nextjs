"use client"

import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import {
    ListItemNode,
    ListNode,
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_UNORDERED_LIST_COMMAND
} from "@lexical/list"
import { $patchStyleText } from "@lexical/selection"
import {
    $getSelection,
    $isRangeSelection,
    FORMAT_TEXT_COMMAND,
    REDO_COMMAND,
    UNDO_COMMAND
} from "lexical"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { RiArrowGoBackLine, RiArrowGoForwardLine } from "@remixicon/react"
import { List, ListOrdered } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from "@/components/ui/tooltip"
import type { LexicalEmailTemplateContent } from "@/lib/email-template-content"
import {
    TemplateVariableNode,
    $createTemplateVariableNode
} from "@/components/email-template/nodes/template-variable-node"
import { getTemplateVariablesByCategory } from "@/lib/email-template-variables"

interface LexicalEmailEditorProps {
    content: LexicalEmailTemplateContent
    onChange: (value: LexicalEmailTemplateContent) => void
}

function Toolbar() {
    const [editor] = useLexicalComposerContext()

    const applyFontSize = (fontSize: string) => {
        editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
                $patchStyleText(selection, {
                    "font-size": fontSize === "default" ? null : fontSize
                })
            }
        })
    }

    const insertVariable = (variableKey: string) => {
        editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
                const node = $createTemplateVariableNode(variableKey)
                selection.insertNodes([node])
            }
        })
        editor.focus()
    }

    const variablesByCategory = getTemplateVariablesByCategory()

    return (
        <div className="flex flex-wrap items-center gap-2 border-b p-2">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            editor.dispatchCommand(UNDO_COMMAND, undefined)
                        }
                        aria-label="Undo"
                    >
                        <RiArrowGoBackLine className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Undo</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            editor.dispatchCommand(REDO_COMMAND, undefined)
                        }
                        aria-label="Redo"
                    >
                        <RiArrowGoForwardLine className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Redo</TooltipContent>
            </Tooltip>
            <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")
                }
            >
                Bold
            </Button>
            <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
                }
            >
                Italic
            </Button>
            <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
                }
            >
                Underline
            </Button>
            <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                defaultValue="default"
                onChange={(e) => applyFontSize(e.target.value)}
                aria-label="Font size"
            >
                <option value="default">Font size</option>
                <option value="12px">Small</option>
                <option value="14px">Normal</option>
                <option value="16px">Large</option>
                <option value="18px">XL</option>
            </select>

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            editor.dispatchCommand(
                                INSERT_UNORDERED_LIST_COMMAND,
                                undefined
                            )
                        }
                        aria-label="Bullet List"
                    >
                        <List className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Bullet List</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            editor.dispatchCommand(
                                INSERT_ORDERED_LIST_COMMAND,
                                undefined
                            )
                        }
                        aria-label="Numbered List"
                    >
                        <ListOrdered className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Numbered List</TooltipContent>
            </Tooltip>

            <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value="default"
                onChange={(e) => {
                    if (e.target.value !== "default") {
                        insertVariable(e.target.value)
                        e.target.value = "default"
                    }
                }}
                aria-label="Insert variable"
            >
                <option value="default">Insert variable...</option>
                {Array.from(variablesByCategory.entries()).map(
                    ([category, variables]) => (
                        <optgroup key={category} label={category}>
                            {variables.map((v) => (
                                <option key={v.key} value={v.key}>
                                    {v.label}
                                </option>
                            ))}
                        </optgroup>
                    )
                )}
            </select>
        </div>
    )
}

export function LexicalEmailEditor({
    content,
    onChange
}: LexicalEmailEditorProps) {
    return (
        <div className="overflow-hidden rounded-md border bg-background">
            <LexicalComposer
                initialConfig={{
                    namespace: "email-template-editor",
                    editorState: JSON.stringify(content),
                    nodes: [ListNode, ListItemNode, TemplateVariableNode],
                    onError(error) {
                        throw error
                    }
                }}
            >
                <Toolbar />
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable className="min-h-80 whitespace-pre-wrap p-3 text-sm outline-none [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6" />
                    }
                    placeholder={
                        <div className="pointer-events-none absolute p-3 text-muted-foreground text-sm">
                            Email content
                        </div>
                    }
                    ErrorBoundary={LexicalErrorBoundary}
                />
                <HistoryPlugin />
                <ListPlugin />
                <OnChangePlugin
                    onChange={(editorState) => {
                        onChange(
                            editorState.toJSON() as LexicalEmailTemplateContent
                        )
                    }}
                />
            </LexicalComposer>
        </div>
    )
}
