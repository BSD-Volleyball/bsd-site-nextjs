"use client"

import {
    DecoratorNode,
    type LexicalNode,
    type NodeKey,
    type SerializedLexicalNode,
    type Spread
} from "lexical"
import { getTemplateVariable } from "@/lib/email-template-variables"

export type SerializedTemplateVariableNode = Spread<
    {
        variableKey: string
    },
    SerializedLexicalNode
>

function TemplateVariableChip({ variableKey }: { variableKey: string }) {
    const variable = getTemplateVariable(variableKey)
    const label = variable?.label ?? variableKey

    return (
        <span
            className="mx-0.5 inline-flex cursor-default select-none items-center rounded-md bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800 text-xs dark:bg-blue-900 dark:text-blue-200"
            title={variable?.description ?? variableKey}
            contentEditable={false}
        >
            {label}
        </span>
    )
}

export class TemplateVariableNode extends DecoratorNode<React.ReactElement> {
    __variableKey: string

    static getType(): string {
        return "template-variable"
    }

    static clone(node: TemplateVariableNode): TemplateVariableNode {
        return new TemplateVariableNode(node.__variableKey, node.__key)
    }

    static importJSON(
        serializedNode: SerializedTemplateVariableNode
    ): TemplateVariableNode {
        return $createTemplateVariableNode(serializedNode.variableKey)
    }

    constructor(variableKey: string, key?: NodeKey) {
        super(key)
        this.__variableKey = variableKey
    }

    exportJSON(): SerializedTemplateVariableNode {
        return {
            type: "template-variable",
            variableKey: this.__variableKey,
            version: 1
        }
    }

    createDOM(): HTMLElement {
        return document.createElement("span")
    }

    updateDOM(): false {
        return false
    }

    isInline(): true {
        return true
    }

    isKeyboardSelectable(): true {
        return true
    }

    decorate(): React.ReactElement {
        return <TemplateVariableChip variableKey={this.__variableKey} />
    }
}

export function $createTemplateVariableNode(
    variableKey: string
): TemplateVariableNode {
    return new TemplateVariableNode(variableKey)
}

export function $isTemplateVariableNode(
    node: LexicalNode | null | undefined
): node is TemplateVariableNode {
    return node instanceof TemplateVariableNode
}
