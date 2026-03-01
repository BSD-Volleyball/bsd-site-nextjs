"use client"

import { useState, useEffect } from "react"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"
import {
    ListItemNode,
    ListNode,
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_UNORDERED_LIST_COMMAND,
    REMOVE_LIST_COMMAND
} from "@lexical/list"
import { $getNearestNodeOfType } from "@lexical/utils"
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

const EDITOR_INSTANCE_KEY = `email-template-editor-${Math.random().toString(36).slice(2)}`

interface LexicalEmailEditorProps {
    content: LexicalEmailTemplateContent
    onChange: (value: LexicalEmailTemplateContent) => void
}

interface ToolbarState {
    isBold: boolean
    isItalic: boolean
    isUnderline: boolean
    blockType: "paragraph" | "ul" | "ol"
}

function Toolbar() {
    const [editor] = useLexicalComposerContext()
    const [state, setState] = useState<ToolbarState>({
        isBold: false,
        isItalic: false,
        isUnderline: false,
        blockType: "paragraph"
    })

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const selection = $getSelection()
                if (!$isRangeSelection(selection)) return

                let blockType: ToolbarState["blockType"] = "paragraph"
                const anchorNode = selection.anchor.getNode()
                const parent =
                    anchorNode.getKey() === "root"
                        ? anchorNode
                        : anchorNode.getTopLevelElementOrThrow()
                const listNode = $getNearestNodeOfType(parent, ListNode)
                if (listNode) {
                    blockType =
                        listNode.getListType() === "number" ? "ol" : "ul"
                }

                setState({
                    isBold: selection.hasFormat("bold"),
                    isItalic: selection.hasFormat("italic"),
                    isUnderline: selection.hasFormat("underline"),
                    blockType
                })
            })
        })
    }, [editor])

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

    const toggleBulletList = () => {
        if (state.blockType === "ul") {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
        } else {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
    }

    const toggleNumberedList = () => {
        if (state.blockType === "ol") {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
        } else {
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
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
                variant={state.isBold ? "default" : "outline"}
                onClick={() =>
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")
                }
            >
                Bold
            </Button>
            <Button
                type="button"
                size="sm"
                variant={state.isItalic ? "default" : "outline"}
                onClick={() =>
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
                }
            >
                Italic
            </Button>
            <Button
                type="button"
                size="sm"
                variant={state.isUnderline ? "default" : "outline"}
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
                        variant={state.blockType === "ul" ? "default" : "outline"}
                        onClick={toggleBulletList}
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
                        variant={state.blockType === "ol" ? "default" : "outline"}
                        onClick={toggleNumberedList}
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
                key={EDITOR_INSTANCE_KEY}
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
                <div className="relative">
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable className="min-h-80 whitespace-pre-wrap p-3 text-sm outline-none [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6" />
                        }
                        placeholder={
                            <div className="pointer-events-none absolute top-0 p-3 text-muted-foreground text-sm">
                                Email content
                            </div>
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                </div>
                <HistoryPlugin />
                <ListPlugin />
                <TabIndentationPlugin />
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
