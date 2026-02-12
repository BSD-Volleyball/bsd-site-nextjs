"use client"

import { useState } from "react"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    updateAccountProfile,
    type AccountProfileData
} from "../settings/actions"

interface AccountFormProps {
    profile: AccountProfileData | null
    email: string
}

export function AccountForm({ profile, email }: AccountFormProps) {
    const [formData, setFormData] = useState<AccountProfileData>({
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        preffered_name: profile?.preffered_name ?? null,
        email: email ?? null,
        phone: profile?.phone ?? null,
        pronouns: profile?.pronouns ?? null,
        emergency_contact: profile?.emergency_contact ?? null
    })
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    const handleChange = (field: keyof AccountProfileData, value: string) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value || null
        }))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)
        setMessage(null)

        const result = await updateAccountProfile(formData)

        setMessage({
            type: result.status ? "success" : "error",
            text: result.message
        })
        setIsLoading(false)

        if (result.status) {
            setTimeout(() => setMessage(null), 3000)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <Card>
                <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>
                        Update your personal information and contact details.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Name Section */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="first_name">First Name</Label>
                            <Input
                                id="first_name"
                                value={formData.first_name ?? ""}
                                onChange={(e) =>
                                    handleChange("first_name", e.target.value)
                                }
                                placeholder="Enter your first name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="last_name">Last Name</Label>
                            <Input
                                id="last_name"
                                value={formData.last_name ?? ""}
                                onChange={(e) =>
                                    handleChange("last_name", e.target.value)
                                }
                                placeholder="Enter your last name"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="preffered_name">
                            Preferred First Name (if different than above)
                        </Label>
                        <Input
                            id="preffered_name"
                            value={formData.preffered_name ?? ""}
                            onChange={(e) =>
                                handleChange("preffered_name", e.target.value)
                            }
                            placeholder="The name you'd like to be called"
                        />
                        <p className="text-muted-foreground text-sm">
                            This is how your name will appear to others.
                        </p>
                    </div>

                    {/* Contact Section */}
                    <div className="border-t pt-6">
                        <h3 className="mb-4 font-medium">
                            Contact Information
                        </h3>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email ?? ""}
                                    onChange={(e) =>
                                        handleChange("email", e.target.value)
                                    }
                                    placeholder="Enter your email address"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone Number</Label>
                                <Input
                                    id="phone"
                                    value={formData.phone ?? ""}
                                    onChange={(e) =>
                                        handleChange("phone", e.target.value)
                                    }
                                    placeholder="Enter your phone number"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Additional Info Section */}
                    <div className="border-t pt-6">
                        <h3 className="mb-4 font-medium">
                            Additional Information
                        </h3>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="pronouns">Pronouns</Label>
                                <Input
                                    id="pronouns"
                                    value={formData.pronouns ?? ""}
                                    onChange={(e) =>
                                        handleChange("pronouns", e.target.value)
                                    }
                                    placeholder="e.g., they/them, she/her, he/him"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="emergency_contact">
                                    Emergency Contact
                                </Label>
                                <Input
                                    id="emergency_contact"
                                    value={formData.emergency_contact ?? ""}
                                    onChange={(e) =>
                                        handleChange(
                                            "emergency_contact",
                                            e.target.value
                                        )
                                    }
                                    placeholder="e.g., Jane Doe (wife) - 555-123-4567"
                                />
                                <p className="text-muted-foreground text-sm">
                                    Name and phone number of someone we can
                                    contact in case of emergency.
                                </p>
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
