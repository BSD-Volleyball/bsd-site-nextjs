"use client"

import { useEffect, useState } from "react"
import { buildPlayerPictureUrl } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { EloTrendChart } from "@/components/analytics/elo-trend-chart"
import { CareerStatTiles } from "@/components/analytics/career-stat-tiles"
import { DivisionHistoryChart } from "@/components/player-detail/division-history-chart"
import {
    getFriendAnalytics,
    type FriendAnalyticsResult
} from "@/app/dashboard/friends/actions"

export function FriendAnalyticsPopup({
    friendId,
    playerPicUrl,
    onClose
}: {
    friendId: string
    playerPicUrl: string
    onClose: () => void
}) {
    const [analytics, setAnalytics] = useState<FriendAnalyticsResult | null>(
        null
    )
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setAnalytics(null)
        setError(null)
        getFriendAnalytics(friendId)
            .then((result) => {
                if (cancelled) return
                if (result.status) {
                    setAnalytics(result.data)
                } else {
                    setError(result.message)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setError("Something went wrong. Please try again.")
                }
            })
        return () => {
            cancelled = true
        }
    }, [friendId])

    const pictureSrc = analytics?.profile.picture
        ? buildPlayerPictureUrl(playerPicUrl, analytics.profile.picture)
        : null

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <DialogContent
                showCloseButton={false}
                aria-describedby={undefined}
                className="block max-h-[90vh] w-[calc(100%-2rem)] max-w-lg gap-0 overflow-y-auto rounded-lg border-0 p-0 shadow-xl sm:rounded-lg"
            >
                <DialogTitle className="sr-only">
                    {analytics?.profile.name ?? "Player analytics"}
                </DialogTitle>
                <Card className="border-0 shadow-none">
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4">
                                {pictureSrc && (
                                    <img
                                        src={pictureSrc}
                                        alt={analytics?.profile.name ?? ""}
                                        className="h-32 w-24 shrink-0 rounded-md object-cover"
                                    />
                                )}
                                <div className="pt-1">
                                    <CardTitle>
                                        {analytics?.profile.name ?? "Loading…"}
                                    </CardTitle>
                                    {analytics?.profile.pronouns && (
                                        <p className="mt-1 text-muted-foreground text-sm">
                                            {analytics.profile.pronouns}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="cursor-pointer text-muted-foreground hover:text-foreground"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {error && (
                            <p className="text-destructive text-sm">{error}</p>
                        )}
                        {!error && !analytics && (
                            <p className="p-4 text-center text-muted-foreground text-sm">
                                Loading analytics...
                            </p>
                        )}
                        {analytics && (
                            <>
                                <EloTrendChart
                                    eloHistory={analytics.eloHistory}
                                    allSeasons={analytics.allSeasons}
                                    height={200}
                                />
                                <CareerStatTiles
                                    stats={analytics.careerStats}
                                    championships={analytics.championships}
                                    gridClassName="grid grid-cols-2 gap-3"
                                />
                                <DivisionHistoryChart
                                    draftHistory={analytics.draftHistory}
                                    allSeasons={analytics.allSeasons}
                                />
                            </>
                        )}
                    </CardContent>
                </Card>
            </DialogContent>
        </Dialog>
    )
}
