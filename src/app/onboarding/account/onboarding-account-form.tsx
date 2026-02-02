"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { updateOnboardingAccount, type OnboardingAccountData } from "./actions"

const PRONOUN_OPTIONS = ["He/Him", "She/Her", "They/Them", "Other"] as const

interface OnboardingAccountFormProps {
    initialData: OnboardingAccountData | null
}

export function OnboardingAccountForm({ initialData }: OnboardingAccountFormProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Determine if initial pronouns match a preset option
    const initialPronouns = initialData?.pronouns ?? ""
    const isPresetPronoun = PRONOUN_OPTIONS.slice(0, 3).includes(initialPronouns as typeof PRONOUN_OPTIONS[number])
    const initialPronounSelection = isPresetPronoun ? initialPronouns : (initialPronouns ? "Other" : "")
    const initialCustomPronouns = isPresetPronoun ? "" : initialPronouns

    const [pronounSelection, setPronounSelection] = useState(initialPronounSelection)
    const [customPronouns, setCustomPronouns] = useState(initialCustomPronouns)

    const [formData, setFormData] = useState({
        preffered_name: initialData?.preffered_name ?? "",
        phone: initialData?.phone ?? "",
        pronouns: initialData?.pronouns ?? "",
        emergency_contact: initialData?.emergency_contact ?? ""
    })

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        // Validate required fields
        if (!formData.phone.trim()) {
            setError("Phone number is required.")
            return
        }
        if (!formData.emergency_contact.trim()) {
            setError("Emergency contact is required.")
            return
        }

        setIsLoading(true)

        const result = await updateOnboardingAccount({
            preffered_name: formData.preffered_name || null,
            phone: formData.phone || null,
            pronouns: formData.pronouns || null,
            emergency_contact: formData.emergency_contact || null
        })

        if (result.status) {
            router.push("/onboarding/volleyball-profile")
        } else {
            setError(result.message)
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <Card>
                <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                    <CardDescription>
                        This information helps us reach you and ensures safety during
                        events.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="preffered_name">
                            Preferred Name{" "}
                            <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                            id="preffered_name"
                            value={formData.preffered_name}
                            onChange={(e) =>
                                setFormData({ ...formData, preffered_name: e.target.value })
                            }
                            placeholder="The name you'd like to be called"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">
                            Phone Number <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) =>
                                setFormData({ ...formData, phone: e.target.value })
                            }
                            placeholder="Your contact phone number"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="pronouns">
                            Pronouns{" "}
                            <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Select
                            value={pronounSelection}
                            onValueChange={(value) => {
                                setPronounSelection(value)
                                if (value === "Other") {
                                    setFormData({ ...formData, pronouns: customPronouns })
                                } else {
                                    setFormData({ ...formData, pronouns: value })
                                    setCustomPronouns("")
                                }
                            }}
                        >
                            <SelectTrigger id="pronouns">
                                <SelectValue placeholder="Select your pronouns" />
                            </SelectTrigger>
                            <SelectContent>
                                {PRONOUN_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {option}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {pronounSelection === "Other" && (
                            <Input
                                id="custom_pronouns"
                                value={customPronouns}
                                onChange={(e) => {
                                    setCustomPronouns(e.target.value)
                                    setFormData({ ...formData, pronouns: e.target.value })
                                }}
                                placeholder="Enter your pronouns"
                                className="mt-2"
                            />
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="emergency_contact">
                            Emergency Contact <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="emergency_contact"
                            value={formData.emergency_contact}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    emergency_contact: e.target.value
                                })
                            }
                            placeholder="e.g., Jane Doe (wife) - 555-123-4567"
                            required
                        />
                    </div>

                    {error && (
                        <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                            {error}
                        </div>
                    )}
                </CardContent>
                <CardFooter className="border-t pt-6">
                    <Button type="submit" disabled={isLoading} className="ml-auto">
                        {isLoading ? "Saving..." : "Continue"}
                    </Button>
                </CardFooter>
            </Card>
        </form>
    )
}
