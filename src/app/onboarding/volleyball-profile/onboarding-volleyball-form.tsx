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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { completeOnboarding, type VolleyballProfileData } from "./actions"

interface OnboardingVolleyballFormProps {
    initialData: VolleyballProfileData | null
}

export function OnboardingVolleyballForm({
    initialData
}: OnboardingVolleyballFormProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [formData, setFormData] = useState<VolleyballProfileData>({
        experience: initialData?.experience ?? null,
        assessment: initialData?.assessment ?? null,
        height: initialData?.height ?? null,
        skill_passer: initialData?.skill_passer ?? false,
        skill_setter: initialData?.skill_setter ?? false,
        skill_hitter: initialData?.skill_hitter ?? false,
        skill_other: initialData?.skill_other ?? false
    })

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        const result = await completeOnboarding(formData)

        if (result.status) {
            router.push("/dashboard")
        } else {
            setError(result.message)
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <Card>
                <CardHeader>
                    <CardTitle>Volleyball Information</CardTitle>
                    <CardDescription>
                        This helps us place you on the right team.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="experience">
                            Experience{" "}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                            id="experience"
                            placeholder="Describe your volleyball experience..."
                            required
                            value={formData.experience ?? ""}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    experience: e.target.value || null
                                })
                            }
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="assessment">Self Assessment</Label>
                        <Textarea
                            id="assessment"
                            placeholder="How would you rate your overall skill level?"
                            value={formData.assessment ?? ""}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    assessment: e.target.value || null
                                })
                            }
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="height">
                            Height <span className="text-destructive">*</span>
                        </Label>
                        <Select
                            required
                            value={formData.height?.toString() ?? ""}
                            onValueChange={(value) =>
                                setFormData({
                                    ...formData,
                                    height: value ? parseInt(value, 10) : null
                                })
                            }
                        >
                            <SelectTrigger id="height">
                                <SelectValue placeholder="Select your height" />
                            </SelectTrigger>
                            <SelectContent>
                                {Array.from({ length: 25 }, (_, i) => {
                                    const inches = 58 + i // 4'10" = 58 inches to 6'10" = 82 inches
                                    const feet = Math.floor(inches / 12)
                                    const remainingInches = inches % 12
                                    return (
                                        <SelectItem
                                            key={inches}
                                            value={inches.toString()}
                                        >
                                            {feet}'{remainingInches}"
                                        </SelectItem>
                                    )
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3">
                        <Label>Skills</Label>
                        <p className="text-muted-foreground text-sm">
                            Select the positions/skills you are comfortable
                            playing.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="skill_passer"
                                    checked={formData.skill_passer}
                                    onCheckedChange={(checked) =>
                                        setFormData({
                                            ...formData,
                                            skill_passer: checked === true
                                        })
                                    }
                                />
                                <Label
                                    htmlFor="skill_passer"
                                    className="cursor-pointer font-normal"
                                >
                                    Passer
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="skill_setter"
                                    checked={formData.skill_setter}
                                    onCheckedChange={(checked) =>
                                        setFormData({
                                            ...formData,
                                            skill_setter: checked === true
                                        })
                                    }
                                />
                                <Label
                                    htmlFor="skill_setter"
                                    className="cursor-pointer font-normal"
                                >
                                    Setter
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="skill_hitter"
                                    checked={formData.skill_hitter}
                                    onCheckedChange={(checked) =>
                                        setFormData({
                                            ...formData,
                                            skill_hitter: checked === true
                                        })
                                    }
                                />
                                <Label
                                    htmlFor="skill_hitter"
                                    className="cursor-pointer font-normal"
                                >
                                    Hitter
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="skill_other"
                                    checked={formData.skill_other}
                                    onCheckedChange={(checked) =>
                                        setFormData({
                                            ...formData,
                                            skill_other: checked === true
                                        })
                                    }
                                />
                                <Label
                                    htmlFor="skill_other"
                                    className="cursor-pointer font-normal"
                                >
                                    Other
                                </Label>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                            {error}
                        </div>
                    )}
                </CardContent>
                <CardFooter className="border-t pt-6">
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="ml-auto"
                    >
                        {isLoading ? "Completing..." : "Complete Setup"}
                    </Button>
                </CardFooter>
            </Card>
        </form>
    )
}
