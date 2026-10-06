"use client"

import type { ReactNode } from "react"
import type { InboundEmailRow } from "./actions"
import type { AssignableAdmin } from "./data"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"

function ControlGroup({
    label,
    children
}: {
    label: string
    children: ReactNode
}) {
    return (
        <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-sm">{label}</p>
            {children}
        </div>
    )
}

/** Assignment dropdown plus the status actions available for the email. */
export function EmailStatusControls({
    email,
    assignableAdmins,
    currentUserId,
    isPending,
    onAssignChange,
    onAssignToMe,
    onClose,
    onReopen,
    onMarkSpam,
    onUnmarkSpam
}: {
    email: InboundEmailRow
    assignableAdmins: AssignableAdmin[]
    currentUserId: string
    isPending: boolean
    onAssignChange: (assigneeId: string) => void
    onAssignToMe: () => void
    onClose: () => void
    onReopen: () => void
    onMarkSpam: () => void
    onUnmarkSpam: () => void
}) {
    return (
        <div className="flex flex-wrap gap-3 border-t pt-2">
            <ControlGroup label="Assign To">
                <Select
                    value={email.assigned_to ?? "unassigned"}
                    onValueChange={onAssignChange}
                    disabled={isPending}
                >
                    <SelectTrigger className="h-8 w-48 text-sm">
                        <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {assignableAdmins.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                                {u.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </ControlGroup>

            {email.assigned_to !== currentUserId && (
                <ControlGroup label="Shortcut">
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={onAssignToMe}
                        disabled={isPending}
                    >
                        Assign to Me
                    </Button>
                </ControlGroup>
            )}

            {email.status === "active" && (
                <ControlGroup label="Action">
                    <Button size="sm" onClick={onClose} disabled={isPending}>
                        Close Email
                    </Button>
                </ControlGroup>
            )}

            {email.status === "closed" && (
                <ControlGroup label="Action">
                    <Button size="sm" onClick={onReopen} disabled={isPending}>
                        Reopen
                    </Button>
                </ControlGroup>
            )}

            {email.status !== "spam" && (
                <ControlGroup label="Spam">
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={onMarkSpam}
                        disabled={isPending}
                    >
                        Mark as Spam
                    </Button>
                </ControlGroup>
            )}

            {email.status === "spam" && (
                <ControlGroup label="Action">
                    <Button
                        size="sm"
                        onClick={onUnmarkSpam}
                        disabled={isPending}
                    >
                        Move to New
                    </Button>
                </ControlGroup>
            )}
        </div>
    )
}
