import { RiUserHeartLine } from "@remixicon/react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { friendScheduleLine } from "@/lib/friends-display"
import type { FriendNextMatchEntry } from "@/lib/friends"

export interface FriendsCardData {
    playerPicUrl: string
    friends: FriendNextMatchEntry[]
}

export function FriendsCard({ data }: { data: FriendsCardData }) {
    return (
        <Card className="min-w-[280px] flex-1">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiUserHeartLine className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">
                        <Link
                            href="/dashboard/friends"
                            className="hover:underline"
                        >
                            Friends
                        </Link>
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {data.friends.map((friend) => (
                    <div
                        key={friend.userId}
                        className="flex items-center gap-3"
                    >
                        {friend.picture ? (
                            <img
                                src={`${data.playerPicUrl}${friend.picture}`}
                                alt={friend.name}
                                className="h-10 w-8 shrink-0 rounded object-cover"
                            />
                        ) : (
                            <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded bg-muted font-medium text-muted-foreground text-xs">
                                {friend.name.charAt(0)}
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="truncate font-medium text-sm">
                                {friend.name}
                            </div>
                            <div className="text-muted-foreground text-xs">
                                {friendScheduleLine(friend)}
                            </div>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
