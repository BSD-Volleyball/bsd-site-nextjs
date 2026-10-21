import { requireSessionOrRedirect } from "@/next/page-guards"
import { playerPicBaseUrl } from "@/config/env"
import { RiLockLine } from "@remixicon/react"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { getSeasonConfig } from "@/lib/site-config"
import { getDraftBoardDivisions } from "@/lib/draft-results"
import { DraftBoardClient } from "./draft-board-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Draft Board"
}

export const dynamic = "force-dynamic"

export default async function DraftBoardPage() {
    const session = await requireSessionOrRedirect()

    const config = await getSeasonConfig()
    const divisions = config.seasonId
        ? await getDraftBoardDivisions(session.user.id, config.seasonId)
        : []

    return (
        <div className="space-y-6">
            <PageHeader
                title="Draft Board"
                description="This season's draft results for your division."
            />
            {divisions.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    The draft board is available to this season's captains,
                    coaches and commissioners.
                </div>
            ) : (
                <>
                    <StatusBanner
                        variant="warning"
                        className="flex items-start gap-3 border-2"
                    >
                        <RiLockLine
                            className="mt-0.5 size-6 shrink-0"
                            aria-hidden="true"
                        />
                        <div className="space-y-1">
                            <p className="font-bold text-lg">
                                What happens in the draft stays in the draft.
                            </p>
                            <p>
                                These results are confidential. Do not share
                                them, talk about them, or show them to anyone
                                else.
                            </p>
                        </div>
                    </StatusBanner>
                    <DraftBoardClient
                        divisions={divisions}
                        playerPicUrl={playerPicBaseUrl()}
                    />
                </>
            )}
        </div>
    )
}
