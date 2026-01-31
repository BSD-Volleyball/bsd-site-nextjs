"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { updateVolleyballProfile, type VolleyballProfileData } from "./actions"

interface VolleyballProfileFormProps {
    initialData: VolleyballProfileData | null
}

export function VolleyballProfileForm({ initialData }: VolleyballProfileFormProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

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
        setIsLoading(true)
        setMessage(null)

        const result = await updateVolleyballProfile(formData)

        setMessage({
            type: result.status ? "success" : "error",
            text: result.message
        })
        setIsLoading(false)

        if (result.status) {
            router.refresh()
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <Card>
                <CardHeader>
                    <CardTitle>Volleyball Information</CardTitle>
                    <CardDescription>
                        Tell us about your volleyball background and skills.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="experience">Experience</Label>
                        <Textarea
                            id="experience"
                            placeholder="Describe your volleyball experience..."
                            value={formData.experience ?? ""}
                            onChange={(e) =>
                                setFormData({ ...formData, experience: e.target.value || null })
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
                                setFormData({ ...formData, assessment: e.target.value || null })
                            }
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="height">Height (inches)</Label>
                        <Input
                            id="height"
                            type="number"
                            placeholder="e.g., 72"
                            value={formData.height ?? ""}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    height: e.target.value ? parseInt(e.target.value, 10) : null
                                })
                            }
                        />
                    </div>

                    <div className="space-y-3">
                        <Label>Skills</Label>
                        <p className="text-sm text-muted-foreground">
                            Select the positions/skills you are comfortable playing.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="skill_passer"
                                    checked={formData.skill_passer ?? false}
                                    onCheckedChange={(checked) =>
                                        setFormData({ ...formData, skill_passer: checked === true })
                                    }
                                />
                                <Label htmlFor="skill_passer" className="font-normal cursor-pointer">
                                    Passer
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="skill_setter"
                                    checked={formData.skill_setter ?? false}
                                    onCheckedChange={(checked) =>
                                        setFormData({ ...formData, skill_setter: checked === true })
                                    }
                                />
                                <Label htmlFor="skill_setter" className="font-normal cursor-pointer">
                                    Setter
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="skill_hitter"
                                    checked={formData.skill_hitter ?? false}
                                    onCheckedChange={(checked) =>
                                        setFormData({ ...formData, skill_hitter: checked === true })
                                    }
                                />
                                <Label htmlFor="skill_hitter" className="font-normal cursor-pointer">
                                    Hitter
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="skill_other"
                                    checked={formData.skill_other ?? false}
                                    onCheckedChange={(checked) =>
                                        setFormData({ ...formData, skill_other: checked === true })
                                    }
                                />
                                <Label htmlFor="skill_other" className="font-normal cursor-pointer">
                                    Other
                                </Label>
                            </div>
                        </div>
                    </div>

                    {message && (
                        <div
                            className={`rounded-md p-3 text-sm ${
                                message.type === "success"
                                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                            }`}
                        >
                            {message.text}
                        </div>
                    )}
                </CardContent>
                <CardFooter className="border-t pt-6">
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? "Saving..." : "Save Changes"}
                    </Button>
                </CardFooter>
            </Card>
        </form>
    )
}
