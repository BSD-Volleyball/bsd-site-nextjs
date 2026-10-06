"use client"

import { useState, useTransition } from "react"
import type { InboundEmailRow } from "./actions"
import type { AssignableAdmin } from "./data"
import { EmailCard } from "./email-card"
import { Badge } from "@/components/ui/badge"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { RiArrowDownSLine, RiArrowRightSLine } from "@remixicon/react"
import { usePlayerDetailModal } from "@/components/player-detail/use-player-detail-modal"
import { AdminPlayerDetailPopup } from "@/components/player-detail/admin-player-detail-popup"

function EmailSection({
    title,
    emails,
    assignableAdmins,
    currentUserId,
    defaultOpen,
    focusEmailId,
    focusNonce,
    onUpdate,
    onFocusEmail,
    onPlayerClick
}: {
    title: string
    emails: InboundEmailRow[]
    assignableAdmins: AssignableAdmin[]
    currentUserId: string
    defaultOpen: boolean
    focusEmailId: number | null
    focusNonce: number
    onUpdate: () => void
    onFocusEmail: (emailId: number) => void
    onPlayerClick: (userId: string) => void
}) {
    // A deep-linked email must be reachable even when it sits in a section
    // that is collapsed by default (Closed/Spam).
    const containsFocus =
        focusEmailId !== null && emails.some((e) => e.id === focusEmailId)
    const [open, setOpen] = useState(defaultOpen || containsFocus)

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
                <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-left font-semibold transition-colors hover:bg-muted/60"
                >
                    {open ? (
                        <RiArrowDownSLine size={18} />
                    ) : (
                        <RiArrowRightSLine size={18} />
                    )}
                    <span>{title}</span>
                    <Badge variant="secondary" className="ml-auto">
                        {emails.length}
                    </Badge>
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-2 space-y-2">
                    {emails.length === 0 ? (
                        <p className="px-2 py-4 text-center text-muted-foreground text-sm">
                            No emails in this category.
                        </p>
                    ) : (
                        emails.map((e) => (
                            <EmailCard
                                key={e.id}
                                email={e}
                                assignableAdmins={assignableAdmins}
                                currentUserId={currentUserId}
                                initiallyExpanded={e.id === focusEmailId}
                                focusRequest={
                                    e.id === focusEmailId ? focusNonce : 0
                                }
                                onUpdate={onUpdate}
                                onFocusEmail={onFocusEmail}
                                onPlayerClick={onPlayerClick}
                            />
                        ))
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

export function ManageEmailsClient({
    initialEmails,
    assignableAdmins,
    playerPicUrl,
    currentUserId,
    focusEmailId = null
}: {
    initialEmails: InboundEmailRow[]
    assignableAdmins: AssignableAdmin[]
    playerPicUrl: string
    currentUserId: string
    focusEmailId?: number | null
}) {
    const [emails, setEmails] = useState(initialEmails)
    const [_isRefreshing, startRefresh] = useTransition()
    // Which email the page is focused on. Seeded by the ?email=<id> deep link
    // and re-pointed by "Assign to Me"; the nonce re-fires focus even when the
    // target email hasn't changed.
    const [focusId, setFocusId] = useState(focusEmailId)
    const [focusNonce, setFocusNonce] = useState(0)

    function focusEmail(emailId: number) {
        setFocusId(emailId)
        setFocusNonce((n) => n + 1)
    }

    const {
        selectedUserId,
        playerDetails,
        draftHistory,
        signupHistory,
        ratingAverages,
        sharedRatingNotes,
        privateRatingNotes,
        emailSuppressions,
        emailHistory,
        viewerRating,
        pairPickName,
        pairReason,
        isLoading: playerLoading,
        openPlayerDetail,
        closePlayerDetail
    } = usePlayerDetailModal()

    function refresh() {
        startRefresh(async () => {
            const { getInboundEmails } = await import("./actions")
            const result = await getInboundEmails()
            if (result.status) {
                setEmails(result.data)
            }
        })
    }

    const newEmails = emails.filter((e) => e.status === "new")
    const activeEmails = emails.filter((e) => e.status === "active")
    const closedEmails = emails.filter((e) => e.status === "closed")
    const spamEmails = emails.filter((e) => e.status === "spam")

    return (
        <div className="space-y-4">
            <EmailSection
                title="New Emails"
                emails={newEmails}
                assignableAdmins={assignableAdmins}
                currentUserId={currentUserId}
                focusEmailId={focusId}
                focusNonce={focusNonce}
                defaultOpen={true}
                onUpdate={refresh}
                onFocusEmail={focusEmail}
                onPlayerClick={openPlayerDetail}
            />
            <EmailSection
                title="Active Emails"
                emails={activeEmails}
                assignableAdmins={assignableAdmins}
                currentUserId={currentUserId}
                focusEmailId={focusId}
                focusNonce={focusNonce}
                defaultOpen={true}
                onUpdate={refresh}
                onFocusEmail={focusEmail}
                onPlayerClick={openPlayerDetail}
            />
            <EmailSection
                title="Closed Emails"
                emails={closedEmails}
                assignableAdmins={assignableAdmins}
                currentUserId={currentUserId}
                focusEmailId={focusId}
                focusNonce={focusNonce}
                defaultOpen={false}
                onUpdate={refresh}
                onFocusEmail={focusEmail}
                onPlayerClick={openPlayerDetail}
            />
            <EmailSection
                title="Spam"
                emails={spamEmails}
                assignableAdmins={assignableAdmins}
                currentUserId={currentUserId}
                focusEmailId={focusId}
                focusNonce={focusNonce}
                defaultOpen={false}
                onUpdate={refresh}
                onFocusEmail={focusEmail}
                onPlayerClick={openPlayerDetail}
            />
            <AdminPlayerDetailPopup
                open={!!selectedUserId}
                onClose={closePlayerDetail}
                playerDetails={playerDetails}
                draftHistory={draftHistory}
                signupHistory={signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={playerLoading}
                pairPickName={pairPickName}
                pairReason={pairReason}
                ratingAverages={ratingAverages}
                sharedRatingNotes={sharedRatingNotes}
                privateRatingNotes={privateRatingNotes}
                emailSuppressions={emailSuppressions}
                emailHistory={emailHistory}
                viewerRating={viewerRating}
            />
        </div>
    )
}
