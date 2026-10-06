"use client"

import { useId, useState } from "react"
import { useAction } from "@/components/hooks/use-action"
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
import { updateVolleyballProfile } from "./actions"
import type { VolleyballProfileData } from "./data"

interface VolleyballProfileFormProps {
    initialData: VolleyballProfileData | null
}

export function VolleyballProfileForm({
    initialData
}: VolleyballProfileFormProps) {
    const uid = useId()
    const { run, pending: isLoading } = useAction(updateVolleyballProfile)

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
        await run(formData)
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
                        <Label htmlFor={`${uid}-experience`}>Experience</Label>
                        <Textarea
                            id={`${uid}-experience`}
                            placeholder="Describe your volleyball experience..."
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
                        <Label htmlFor={`${uid}-assessment`}>
                            Self Assessment
                        </Label>
                        <Textarea
                            id={`${uid}-assessment`}
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
                        <Label htmlFor={`${uid}-height`}>Height</Label>
                        <Select
                            value={formData.height?.toString() ?? ""}
                            onValueChange={(value) =>
                                setFormData({
                                    ...formData,
                                    height: value ? parseInt(value, 10) : null
                                })
                            }
                        >
                            <SelectTrigger id={`${uid}-height`}>
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
                                    id={`${uid}-skill_passer`}
                                    checked={formData.skill_passer ?? false}
                                    onCheckedChange={(checked) =>
                                        setFormData({
                                            ...formData,
                                            skill_passer: checked === true
                                        })
                                    }
                                />
                                <Label
                                    htmlFor={`${uid}-skill_passer`}
                                    className="cursor-pointer font-normal"
                                >
                                    Passer
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id={`${uid}-skill_setter`}
                                    checked={formData.skill_setter ?? false}
                                    onCheckedChange={(checked) =>
                                        setFormData({
                                            ...formData,
                                            skill_setter: checked === true
                                        })
                                    }
                                />
                                <Label
                                    htmlFor={`${uid}-skill_setter`}
                                    className="cursor-pointer font-normal"
                                >
                                    Setter
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id={`${uid}-skill_hitter`}
                                    checked={formData.skill_hitter ?? false}
                                    onCheckedChange={(checked) =>
                                        setFormData({
                                            ...formData,
                                            skill_hitter: checked === true
                                        })
                                    }
                                />
                                <Label
                                    htmlFor={`${uid}-skill_hitter`}
                                    className="cursor-pointer font-normal"
                                >
                                    Hitter
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id={`${uid}-skill_other`}
                                    checked={formData.skill_other ?? false}
                                    onCheckedChange={(checked) =>
                                        setFormData({
                                            ...formData,
                                            skill_other: checked === true
                                        })
                                    }
                                />
                                <Label
                                    htmlFor={`${uid}-skill_other`}
                                    className="cursor-pointer font-normal"
                                >
                                    Other
                                </Label>
                            </div>
                        </div>
                    </div>
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
