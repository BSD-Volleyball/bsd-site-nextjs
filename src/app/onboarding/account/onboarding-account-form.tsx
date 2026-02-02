"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { updateOnboardingAccount, type OnboardingAccountData } from "./actions"

const PRESET_PRONOUNS = ["He/Him", "She/Her", "They/Them"] as const
const BLANK_VALUE = "none"

interface OnboardingAccountFormProps {
    initialData: OnboardingAccountData | null
}

export function OnboardingAccountForm({ initialData }: OnboardingAccountFormProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Determine if initial pronouns match a preset option
    const initialPronouns = initialData?.pronouns ?? ""
    const isPresetPronoun = PRESET_PRONOUNS.includes(initialPronouns as typeof PRESET_PRONOUNS[number])
    const initialPronounSelection = !initialPronouns
        ? BLANK_VALUE
        : isPresetPronoun
          ? initialPronouns
          : "Other"
    const initialCustomPronouns = isPresetPronoun || !initialPronouns ? "" : initialPronouns

    const [pronounSelection, setPronounSelection] = useState(initialPronounSelection)
    const [customPronouns, setCustomPronouns] = useState(initialCustomPronouns)

    const [formData, setFormData] = useState({
        preffered_name: initialData?.preffered_name ?? "",
        phone: initialData?.phone ?? "",
        pronouns: initialData?.pronouns ?? "",
        emergency_contact: initialData?.emergency_contact ?? "",
        male: initialData?.male ?? null as boolean | null,
        referred_by: initialData?.referred_by ?? ""
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
        if (formData.male === null) {
            setError("Please select Yes or No for 'Male? (why)'.")
            return
        }

        setIsLoading(true)

        const result = await updateOnboardingAccount({
            preffered_name: formData.preffered_name || null,
            phone: formData.phone || null,
            pronouns: formData.pronouns || null,
            emergency_contact: formData.emergency_contact || null,
            male: formData.male,
            referred_by: formData.referred_by || null
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
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>
                        Gathering this information now so you don't have to enter it every season.  You can update it at any time on the Account page.
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
                        <Label>
                            Male? (<Link href="/gender-policy" className="underline hover:text-primary" target="_blank">why</Link>) <span className="text-destructive">*</span>
                        </Label>
                        <RadioGroup
                            value={formData.male === null ? "" : formData.male ? "yes" : "no"}
                            onValueChange={(value) =>
                                setFormData({ ...formData, male: value === "yes" })
                            }
                            className="flex gap-4"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="yes" id="male-yes" />
                                <Label htmlFor="male-yes" className="font-normal cursor-pointer">
                                    Yes
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="no" id="male-no" />
                                <Label htmlFor="male-no" className="font-normal cursor-pointer">
                                    No
                                </Label>
                            </div>
                        </RadioGroup>
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
                                if (value === BLANK_VALUE) {
                                    setFormData({ ...formData, pronouns: "" })
                                    setCustomPronouns("")
                                } else if (value === "Other") {
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
                                <SelectItem value={BLANK_VALUE}>
                                    <span className="text-muted-foreground">—</span>
                                </SelectItem>
                                {PRESET_PRONOUNS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {option}
                                    </SelectItem>
                                ))}
                                <SelectItem value="Other">Other</SelectItem>
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

                    <div className="space-y-2">
                        <Label htmlFor="referred_by">
                            Referred By{" "}
                            <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                            id="referred_by"
                            value={formData.referred_by}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    referred_by: e.target.value
                                })
                            }
                            placeholder="Who referred you to the league?"
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
