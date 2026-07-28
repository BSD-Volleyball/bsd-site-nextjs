"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_TYPES,
    type NotificationCategoryId,
    type NotificationType,
    typesInCategory
} from "@/lib/notifications/types"

interface NotificationPreferencesEditorProps {
    /** Types the user has opted OUT of (checked box = subscribed) */
    optedOut: Set<NotificationType>
    onChange: (next: Set<NotificationType>) => void
    disabled?: boolean
    /** Prefix for element ids so two editors can coexist on a page */
    idPrefix?: string
}

const ALWAYS_ON_TYPES = (
    Object.keys(NOTIFICATION_TYPES) as NotificationType[]
).filter((type) => NOTIFICATION_TYPES[type].mandatory)

export function NotificationPreferencesEditor({
    optedOut,
    onChange,
    disabled = false,
    idPrefix = "notif"
}: NotificationPreferencesEditorProps) {
    const categories = Object.keys(
        NOTIFICATION_CATEGORIES
    ) as NotificationCategoryId[]

    const setTypes = (types: NotificationType[], subscribed: boolean) => {
        const next = new Set(optedOut)
        for (const type of types) {
            if (subscribed) next.delete(type)
            else next.add(type)
        }
        onChange(next)
    }

    return (
        <div className="space-y-4">
            {categories.map((category) => {
                const types = typesInCategory(category)
                const subscribedCount = types.filter(
                    (t) => !optedOut.has(t)
                ).length
                const masterState: boolean | "indeterminate" =
                    subscribedCount === types.length
                        ? true
                        : subscribedCount === 0
                          ? false
                          : "indeterminate"
                const def = NOTIFICATION_CATEGORIES[category]
                const masterId = `${idPrefix}-cat-${category}`

                return (
                    <Card key={category}>
                        <CardHeader className="pb-3">
                            <div className="flex items-start gap-3">
                                <Checkbox
                                    id={masterId}
                                    checked={masterState}
                                    disabled={disabled}
                                    onCheckedChange={(checked) =>
                                        // From indeterminate, one click
                                        // subscribes the whole category.
                                        setTypes(types, checked !== false)
                                    }
                                />
                                <div className="space-y-1">
                                    <Label
                                        htmlFor={masterId}
                                        className="cursor-pointer font-semibold"
                                    >
                                        <CardTitle className="text-base">
                                            {def.label}
                                        </CardTitle>
                                    </Label>
                                    <p className="text-muted-foreground text-sm">
                                        {def.description}
                                    </p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {types.map((type) => {
                                const typeDef = NOTIFICATION_TYPES[type]
                                const typeId = `${idPrefix}-type-${type}`
                                return (
                                    <div
                                        key={type}
                                        className="flex items-start gap-3 pl-7"
                                    >
                                        <Checkbox
                                            id={typeId}
                                            checked={!optedOut.has(type)}
                                            disabled={disabled}
                                            onCheckedChange={(checked) =>
                                                setTypes(
                                                    [type],
                                                    checked === true
                                                )
                                            }
                                        />
                                        <div className="space-y-0.5">
                                            <Label
                                                htmlFor={typeId}
                                                className="cursor-pointer font-normal"
                                            >
                                                {typeDef.label}
                                            </Label>
                                            <p className="text-muted-foreground text-xs">
                                                {typeDef.description}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                        </CardContent>
                    </Card>
                )
            })}

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Always on</CardTitle>
                    <p className="text-muted-foreground text-sm">
                        Essential league communication that can't be turned off.
                    </p>
                </CardHeader>
                <CardContent className="space-y-3">
                    {ALWAYS_ON_TYPES.map((type) => {
                        const typeDef = NOTIFICATION_TYPES[type]
                        return (
                            <div
                                key={type}
                                className="flex items-start gap-3 pl-7"
                            >
                                <Checkbox checked disabled />
                                <div className="space-y-0.5">
                                    <Label className="font-normal">
                                        {typeDef.label}
                                    </Label>
                                    <p className="text-muted-foreground text-xs">
                                        {typeDef.description}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </CardContent>
            </Card>
        </div>
    )
}
