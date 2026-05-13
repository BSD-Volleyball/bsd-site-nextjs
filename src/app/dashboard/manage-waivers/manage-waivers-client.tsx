"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { WaiverContent } from "@/components/waiver-content"
import {
    createWaiverVersion,
    publishWaiverVersion,
    type WaiverRow
} from "./actions"

interface Props {
    waivers: WaiverRow[]
}

function formatDate(d: Date | string) {
    const date = typeof d === "string" ? new Date(d) : d
    return date.toLocaleString()
}

export function ManageWaiversClient({ waivers }: Props) {
    const router = useRouter()
    const [content, setContent] = useState("")
    const [publishImmediately, setPublishImmediately] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [publishingId, setPublishingId] = useState<number | null>(null)

    const handleCreate = async () => {
        if (content.trim().length === 0) {
            toast.error("Waiver content cannot be empty.")
            return
        }
        setIsSubmitting(true)
        const result = await createWaiverVersion(content, publishImmediately)
        setIsSubmitting(false)

        if (result.status) {
            toast.success(
                publishImmediately
                    ? `Created and published waiver #${result.data.id}.`
                    : `Created waiver #${result.data.id} (not yet published).`
            )
            setContent("")
            setPublishImmediately(false)
            router.refresh()
        } else {
            toast.error(result.message)
        }
    }

    const handlePublish = async (id: number) => {
        setPublishingId(id)
        const result = await publishWaiverVersion(id)
        setPublishingId(null)

        if (result.status) {
            toast.success(`Published waiver #${id}.`)
            router.refresh()
        } else {
            toast.error(result.message)
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Create new version</CardTitle>
                    <CardDescription>
                        Existing versions cannot be edited — to revise the
                        waiver, publish a new version. Use a blank line between
                        paragraphs.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={14}
                        placeholder="Paste or write the new waiver text here..."
                    />
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="publish-immediately"
                            checked={publishImmediately}
                            onCheckedChange={(c: boolean | "indeterminate") =>
                                setPublishImmediately(c === true)
                            }
                        />
                        <Label
                            htmlFor="publish-immediately"
                            className="cursor-pointer"
                        >
                            Publish immediately (replaces the current active
                            version)
                        </Label>
                    </div>
                    <Button onClick={handleCreate} disabled={isSubmitting}>
                        {isSubmitting ? "Creating..." : "Create version"}
                    </Button>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <h2 className="font-semibold text-lg">Version history</h2>
                {waivers.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No waiver versions exist yet.
                    </p>
                ) : (
                    waivers.map((w) => (
                        <Card key={w.id}>
                            <CardHeader>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <CardTitle className="flex items-center gap-2">
                                            Version #{w.id}
                                            {w.active && (
                                                <Badge variant="default">
                                                    Active
                                                </Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription>
                                            Created {formatDate(w.created_at)}
                                            {w.created_by_name
                                                ? ` by ${w.created_by_name}`
                                                : ""}
                                        </CardDescription>
                                    </div>
                                    {!w.active && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={publishingId !== null}
                                            onClick={() => handlePublish(w.id)}
                                        >
                                            {publishingId === w.id
                                                ? "Publishing..."
                                                : "Publish this version"}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <WaiverContent
                                    content={w.content}
                                    className="max-h-80"
                                />
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
