"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CalendarLinksDialog } from "@/components/calendar/calendar-links-dialog"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { UserCombobox } from "@/components/user-combobox"
import { friendScheduleLine, friendLastResultLine } from "@/lib/friends-display"
import type { FriendsPageData } from "./data"
import {
    cancelFriendRequest,
    removeFriend,
    respondToFriendRequest,
    sendFriendRequest
} from "./actions"
import { FriendAnalyticsPopup } from "@/components/friends/friend-analytics-popup"

function FriendThumbnail({
    picture,
    name,
    playerPicUrl
}: {
    picture: string | null
    name: string
    playerPicUrl: string
}) {
    if (picture) {
        return (
            <img
                src={`${playerPicUrl}${picture}`}
                alt={name}
                className="h-12 w-9 shrink-0 rounded-md object-cover"
            />
        )
    }
    return (
        <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md bg-muted font-medium text-muted-foreground text-sm">
            {name.charAt(0)}
        </div>
    )
}

export function FriendsPageClient({ data }: { data: FriendsPageData }) {
    const router = useRouter()
    const [addOpen, setAddOpen] = useState(false)
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
        null
    )
    const [analyticsFriendId, setAnalyticsFriendId] = useState<string | null>(
        null
    )
    const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    async function run(
        action: () => Promise<{
            status: boolean
            message?: string
        }>
    ) {
        setBusy(true)
        try {
            const result = await action()
            if (result.status) {
                if (result.message) toast.success(result.message)
                router.refresh()
            } else {
                toast.error(result.message ?? "Something went wrong.")
            }
            return result.status
        } finally {
            setBusy(false)
        }
    }

    async function handleSendRequest() {
        if (!selectedMemberId) return
        const succeeded = await run(() => sendFriendRequest(selectedMemberId))
        if (succeeded) {
            setSelectedMemberId(null)
            setAddOpen(false)
        }
    }

    async function handleRemove(userId: string) {
        await run(() => removeFriend(userId))
        setConfirmRemoveId(null)
    }

    return (
        <div className="space-y-6">
            {data.incoming.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Friend Requests</CardTitle>
                        <CardDescription>
                            Players who want to add you as a friend.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {data.incoming.map((request) => (
                            <div
                                key={request.friendshipId}
                                className="flex items-center gap-3"
                            >
                                <FriendThumbnail
                                    picture={request.picture}
                                    name={request.name}
                                    playerPicUrl={data.playerPicUrl}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium">
                                        {request.name}
                                    </div>
                                    <div className="text-muted-foreground text-sm">
                                        Requested{" "}
                                        {request.createdAt.toLocaleDateString()}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    disabled={busy}
                                    onClick={() =>
                                        run(() =>
                                            respondToFriendRequest(
                                                request.friendshipId,
                                                "accept"
                                            )
                                        )
                                    }
                                >
                                    Approve
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() =>
                                        run(() =>
                                            respondToFriendRequest(
                                                request.friendshipId,
                                                "decline"
                                            )
                                        )
                                    }
                                >
                                    Decline
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <CardTitle>My Friends</CardTitle>
                            <CardDescription>
                                Click a friend's name to see their analytics.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <CalendarLinksDialog triggerLabel="Friends calendar" />
                            <Button onClick={() => setAddOpen(true)}>
                                Add a Friend
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {data.friends.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            You haven't added any friends yet. Use "Add a
                            Friend" to send your first request.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {data.friends.map((friend) => (
                                <div
                                    key={friend.friendshipId}
                                    className="flex items-start gap-3"
                                >
                                    <FriendThumbnail
                                        picture={friend.picture}
                                        name={friend.name}
                                        playerPicUrl={data.playerPicUrl}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <button
                                            type="button"
                                            className="cursor-pointer font-medium hover:underline"
                                            onClick={() =>
                                                setAnalyticsFriendId(
                                                    friend.userId
                                                )
                                            }
                                        >
                                            {friend.name}
                                        </button>
                                        <div className="text-muted-foreground text-sm">
                                            {friend.nextMatch ||
                                            friend.preseason
                                                ? `Next: ${friendScheduleLine(friend, { includeOpponent: true })}`
                                                : friendScheduleLine(friend)}
                                        </div>
                                        <div className="text-muted-foreground text-sm">
                                            Last result:{" "}
                                            {friendLastResultLine(
                                                friend.lastResult
                                            )}
                                        </div>
                                    </div>
                                    {confirmRemoveId === friend.userId ? (
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={busy}
                                                onClick={() =>
                                                    handleRemove(friend.userId)
                                                }
                                            >
                                                Confirm
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={busy}
                                                onClick={() =>
                                                    setConfirmRemoveId(null)
                                                }
                                            >
                                                Keep
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() =>
                                                setConfirmRemoveId(
                                                    friend.userId
                                                )
                                            }
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {data.outgoing.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Sent Requests</CardTitle>
                        <CardDescription>
                            Waiting for these players to approve.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {data.outgoing.map((request) => (
                            <div
                                key={request.friendshipId}
                                className="flex items-center gap-3"
                            >
                                <FriendThumbnail
                                    picture={request.picture}
                                    name={request.name}
                                    playerPicUrl={data.playerPicUrl}
                                />
                                <div className="min-w-0 flex-1 font-medium">
                                    {request.name}
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() =>
                                        run(() =>
                                            cancelFriendRequest(
                                                request.friendshipId
                                            )
                                        )
                                    }
                                >
                                    Cancel
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <Dialog
                open={addOpen}
                onOpenChange={(open) => {
                    setAddOpen(open)
                    if (!open) setSelectedMemberId(null)
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add a Friend</DialogTitle>
                        <DialogDescription>
                            Search for a player and send them a friend request.
                            They'll need to approve it before you're connected.
                        </DialogDescription>
                    </DialogHeader>
                    <UserCombobox
                        users={data.members}
                        value={selectedMemberId}
                        onChange={setSelectedMemberId}
                        placeholder="Search for a player..."
                    />
                    <DialogFooter>
                        <Button
                            onClick={handleSendRequest}
                            disabled={!selectedMemberId || busy}
                        >
                            Send Request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {analyticsFriendId && (
                <FriendAnalyticsPopup
                    friendId={analyticsFriendId}
                    playerPicUrl={data.playerPicUrl}
                    onClose={() => setAnalyticsFriendId(null)}
                />
            )}
        </div>
    )
}
