"use client"

import { useOthers, useSelf, useRoom } from "@/lib/liveblocks.config"
import { cn } from "@/lib/utils"

export function PresenceBar() {
    const others = useOthers()
    const self = useSelf()
    const room = useRoom()
    const status = room.getStatus()
    const isReconnecting =
        status === "reconnecting" || status === "disconnected"

    return (
        <div className="mb-4 space-y-2">
            {isReconnecting && (
                <div className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                    Reconnecting to live draft...
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-muted-foreground">
                    Connected:
                </span>
                {self && (
                    <span
                        className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                            self.info?.role === "commissioner"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                        )}
                    >
                        <span
                            className={cn(
                                "h-2 w-2 rounded-full",
                                self.info?.role === "commissioner"
                                    ? "bg-purple-500"
                                    : "bg-blue-500"
                            )}
                        />
                        {self.info?.name ?? "You"}{" "}
                        <span className="opacity-70">(you)</span>
                    </span>
                )}
                {others.map((other) => (
                    <span
                        key={other.connectionId}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                            other.info?.role === "commissioner"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                        )}
                    >
                        <span
                            className={cn(
                                "h-2 w-2 rounded-full",
                                other.info?.role === "commissioner"
                                    ? "bg-purple-500"
                                    : "bg-blue-500"
                            )}
                        />
                        {other.info?.name ?? "Unknown"}
                        <span className="opacity-70">
                            ({other.info?.role ?? "?"})
                        </span>
                    </span>
                ))}
                {!self && others.length === 0 && (
                    <span className="text-muted-foreground text-xs">
                        No one connected
                    </span>
                )}
            </div>
        </div>
    )
}
