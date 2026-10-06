"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { useAction } from "@/components/hooks/use-action"
import { submitConcern } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"

export function ReportConcernForm() {
    const router = useRouter()
    const id = useId()
    const { run, pending: isPending } = useAction(submitConcern, {
        refresh: false
    })
    const [submitted, setSubmitted] = useState(false)
    const [submittedText, setSubmittedText] = useState("")

    // Form state
    const [anonymous, setAnonymous] = useState(false)
    const [wantFollowup, setWantFollowup] = useState(false)
    const [contactName, setContactName] = useState("")
    const [contactEmail, setContactEmail] = useState("")
    const [contactPhone, setContactPhone] = useState("")
    const [incidentDate, setIncidentDate] = useState("")
    const [location, setLocation] = useState("")
    const [personInvolved, setPersonInvolved] = useState("")
    const [witnesses, setWitnesses] = useState("")
    const [teamMatch, setTeamMatch] = useState("")
    const [description, setDescription] = useState("")

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        const result = await run({
            anonymous,
            contact_name: contactName,
            contact_email: contactEmail,
            contact_phone: contactPhone,
            want_followup: wantFollowup,
            incident_date: incidentDate,
            location,
            person_involved: personInvolved,
            witnesses,
            team_match: teamMatch,
            description
        })

        if (result?.status) {
            setSubmitted(true)
            setSubmittedText(result.message ?? "")
        }
    }

    if (submitted) {
        return (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950">
                <h2 className="mb-2 font-semibold text-green-800 text-lg dark:text-green-200">
                    Concern Submitted
                </h2>
                <p className="text-green-700 dark:text-green-300">
                    {submittedText}
                </p>
                <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() => router.push("/dashboard")}
                >
                    Return to Dashboard
                </Button>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Anonymity selection */}
            <div className="rounded-lg border p-4">
                <div className="flex items-start gap-3">
                    <Checkbox
                        id={`${id}-anonymous`}
                        checked={anonymous}
                        onCheckedChange={(checked) => {
                            setAnonymous(checked === true)
                            if (checked) {
                                setWantFollowup(false)
                            }
                        }}
                        className="mt-0.5"
                    />
                    <div>
                        <Label
                            htmlFor={`${id}-anonymous`}
                            className="cursor-pointer font-medium"
                        >
                            Submit anonymously
                        </Label>
                        <p className="mt-0.5 text-muted-foreground text-sm">
                            Your identity will not be recorded. Note that
                            anonymous submissions limit our ability to follow up
                            with you.
                        </p>
                    </div>
                </div>
            </div>

            {/* Contact info — shown when NOT anonymous */}
            {!anonymous && (
                <div className="space-y-4 rounded-lg border p-4">
                    <h2 className="font-medium">Your Contact Information</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-contact_name`}>Name</Label>
                            <Input
                                id={`${id}-contact_name`}
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                                placeholder="Your name"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-contact_email`}>Email</Label>
                            <Input
                                id={`${id}-contact_email`}
                                type="email"
                                value={contactEmail}
                                onChange={(e) =>
                                    setContactEmail(e.target.value)
                                }
                                placeholder="your@email.com"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-contact_phone`}>
                                Phone (optional)
                            </Label>
                            <Input
                                id={`${id}-contact_phone`}
                                type="tel"
                                value={contactPhone}
                                onChange={(e) =>
                                    setContactPhone(e.target.value)
                                }
                                placeholder="(555) 555-5555"
                            />
                        </div>
                    </div>
                    <div className="flex items-start gap-3 pt-1">
                        <Checkbox
                            id={`${id}-want_followup`}
                            checked={wantFollowup}
                            onCheckedChange={(checked) =>
                                setWantFollowup(checked === true)
                            }
                            className="mt-0.5"
                        />
                        <Label
                            htmlFor={`${id}-want_followup`}
                            className="cursor-pointer"
                        >
                            I would like someone to follow up with me about this
                            concern
                        </Label>
                    </div>
                </div>
            )}

            {/* Incident details */}
            <div className="space-y-4">
                <h2 className="font-medium text-lg">Incident Details</h2>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor={`${id}-incident_date`}>
                            Date of Incident{" "}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id={`${id}-incident_date`}
                            type="date"
                            required
                            value={incidentDate}
                            onChange={(e) => setIncidentDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${id}-location`}>
                            Location of Incident{" "}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id={`${id}-location`}
                            required
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="e.g. Court 3, SoccerPlex"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-person_involved`}>
                        Person(s) Involved{" "}
                        <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id={`${id}-person_involved`}
                        required
                        value={personInvolved}
                        onChange={(e) => setPersonInvolved(e.target.value)}
                        placeholder="Name(s) of the person(s) involved"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-witnesses`}>
                        Witnesses (optional)
                    </Label>
                    <Input
                        id={`${id}-witnesses`}
                        value={witnesses}
                        onChange={(e) => setWitnesses(e.target.value)}
                        placeholder="Names of any witnesses"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-team_match`}>
                        Team / Match Involved (optional)
                    </Label>
                    <Input
                        id={`${id}-team_match`}
                        value={teamMatch}
                        onChange={(e) => setTeamMatch(e.target.value)}
                        placeholder="e.g. Team Voltron vs. Team Spike"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-description`}>
                        In your own words, please describe what happened{" "}
                        <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                        id={`${id}-description`}
                        required
                        rows={6}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Please provide as much detail as you feel comfortable sharing..."
                    />
                </div>
            </div>

            <div className="flex items-center gap-4">
                <Button type="submit" disabled={isPending}>
                    {isPending ? "Submitting..." : "Submit Concern"}
                </Button>
                <p className="text-muted-foreground text-sm">
                    Fields marked with{" "}
                    <span className="text-destructive">*</span> are required.
                </p>
            </div>
        </form>
    )
}
