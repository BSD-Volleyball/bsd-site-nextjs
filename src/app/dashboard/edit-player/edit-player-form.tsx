"use client"

import { useRef, useState, useTransition } from "react"
import { UserCombobox } from "@/app/dashboard/manage-discounts/user-combobox"
import {
    createPlayerPictureUpload,
    finalizePlayerPictureUpload,
    getUserDetails,
    updateUser,
    getSignupForCurrentSeason,
    updateSignup
} from "./actions"
import type { UserDetails, SignupDetails } from "./actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { compressImageForUpload } from "@/lib/image-compression"
import { googleMembershipOptions } from "@/lib/google-membership"

interface EditPlayerFormProps {
    users: { id: string; name: string }[]
    playerPicUrl: string
}

interface FormData {
    id: string
    name: string
    first_name: string
    last_name: string
    preffered_name: string
    email: string
    emailVerified: boolean
    image: string
    avatar: string
    avatarUrl: string
    old_id: string
    picture: string
    phone: string
    experience: string
    assessment: string
    height: string
    skill_setter: boolean
    skill_hitter: boolean
    skill_passer: boolean
    skill_other: boolean
    emergency_contact: string
    referred_by: string
    pronouns: string
    role: string
    male: boolean
    onboarding_completed: boolean
    seasons_list: string
    notification_list: string
    captain_eligible: boolean
    createdAt: string
    updatedAt: string
}

function normalizeMembershipValue(value: string | null | undefined): string {
    if (!value || value === "false") {
        return ""
    }

    return googleMembershipOptions.some((option) => option.value === value)
        ? value
        : ""
}

const readOnlyFields = new Set([
    "id",
    "name",
    "role",
    "image",
    "avatar",
    "avatarUrl"
])

interface SignupFormData {
    id: number
    seasonLabel: string
    age: string
    captain: string
    pair: boolean
    pair_pick: string
    pair_reason: string
    dates_missing: string
    play_1st_week: boolean
    order_id: string
    amount_paid: string
    created_at: string
}

function signupToFormData(signup: SignupDetails): SignupFormData {
    return {
        id: signup.id,
        seasonLabel: signup.seasonLabel,
        age: signup.age ?? "",
        captain: signup.captain ?? "",
        pair: signup.pair ?? false,
        pair_pick: signup.pair_pick ?? "",
        pair_reason: signup.pair_reason ?? "",
        dates_missing: signup.dates_missing ?? "",
        play_1st_week: signup.play_1st_week ?? false,
        order_id: signup.order_id ?? "",
        amount_paid: signup.amount_paid ?? "",
        created_at: signup.created_at
            ? new Date(signup.created_at).toLocaleString()
            : ""
    }
}

function computeDisplayName(
    firstName: string,
    lastName: string,
    preferredName: string
): string {
    const displayFirst = preferredName || firstName
    return `${displayFirst} ${lastName}`.trim()
}

function userToFormData(user: UserDetails): FormData {
    return {
        id: user.id,
        name: user.name ?? "",
        first_name: user.first_name,
        last_name: user.last_name,
        preffered_name: user.preffered_name ?? "",
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image ?? "",
        avatar: user.avatar ?? "",
        avatarUrl: user.avatarUrl ?? "",
        old_id: user.old_id?.toString() ?? "",
        picture: user.picture ?? "",
        phone: user.phone ?? "",
        experience: user.experience ?? "",
        assessment: user.assessment ?? "",
        height: user.height?.toString() ?? "",
        skill_setter: user.skill_setter ?? false,
        skill_hitter: user.skill_hitter ?? false,
        skill_passer: user.skill_passer ?? false,
        skill_other: user.skill_other ?? false,
        emergency_contact: user.emergency_contact ?? "",
        referred_by: user.referred_by ?? "",
        pronouns: user.pronouns ?? "",
        role: user.role ?? "",
        male: user.male ?? false,
        onboarding_completed: user.onboarding_completed ?? false,
        seasons_list: normalizeMembershipValue(user.seasons_list),
        notification_list: normalizeMembershipValue(user.notification_list),
        captain_eligible: user.captain_eligible ?? true,
        createdAt: user.createdAt
            ? new Date(user.createdAt).toLocaleString()
            : "",
        updatedAt: user.updatedAt
            ? new Date(user.updatedAt).toLocaleString()
            : ""
    }
}

export function EditPlayerForm({ users, playerPicUrl }: EditPlayerFormProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [originalId, setOriginalId] = useState<string | null>(null)
    const [formData, setFormData] = useState<FormData | null>(null)
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{
        text: string
        type: "success" | "error"
    } | null>(null)
    const [signupData, setSignupData] = useState<SignupFormData | null>(null)
    const [signupMessage, setSignupMessage] = useState<{
        text: string
        type: "success" | "error"
    } | null>(null)
    const [isPending, startTransition] = useTransition()
    const [isSignupPending, startSignupTransition] = useTransition()
    const [isPictureUploadPending, startPictureUploadTransition] =
        useTransition()
    const [pictureFile, setPictureFile] = useState<File | null>(null)
    const [pictureMessage, setPictureMessage] = useState<{
        text: string
        type: "success" | "error"
    } | null>(null)

    const maxSourcePictureUploadBytes = 25 * 1024 * 1024

    const handleUserSelect = async (userId: string | null) => {
        setSelectedUserId(userId)
        setMessage(null)
        setSignupMessage(null)
        setFormData(null)
        setSignupData(null)
        setOriginalId(null)
        setPictureFile(null)
        setPictureMessage(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }

        if (!userId) return

        setLoading(true)
        const [userResult, signupResult] = await Promise.all([
            getUserDetails(userId),
            getSignupForCurrentSeason(userId)
        ])
        setLoading(false)

        if (userResult.status && userResult.user) {
            setFormData(userToFormData(userResult.user))
            setOriginalId(userResult.user.id)
        } else {
            setMessage({
                text: userResult.message || "Failed to load user.",
                type: "error"
            })
        }

        if (signupResult.status && signupResult.signup) {
            setSignupData(signupToFormData(signupResult.signup))
        }
    }

    const handleTextChange = (field: keyof FormData, value: string) => {
        if (!formData) return

        const updated = { ...formData, [field]: value }

        if (
            field === "first_name" ||
            field === "last_name" ||
            field === "preffered_name"
        ) {
            updated.name = computeDisplayName(
                updated.first_name,
                updated.last_name,
                updated.preffered_name
            )
        }

        setFormData(updated)
    }

    const handleBooleanChange = (field: keyof FormData, value: boolean) => {
        if (!formData) return
        setFormData({ ...formData, [field]: value })
    }

    const handleSave = () => {
        if (!formData || !originalId) return

        startTransition(async () => {
            const result = await updateUser(originalId, {
                name: formData.name || null,
                first_name: formData.first_name,
                last_name: formData.last_name,
                preffered_name: formData.preffered_name || null,
                email: formData.email,
                emailVerified: formData.emailVerified,
                old_id: formData.old_id ? parseInt(formData.old_id, 10) : 0,
                picture: formData.picture || null,
                phone: formData.phone || null,
                experience: formData.experience || null,
                assessment: formData.assessment || null,
                height: formData.height ? parseInt(formData.height, 10) : null,
                skill_setter: formData.skill_setter,
                skill_hitter: formData.skill_hitter,
                skill_passer: formData.skill_passer,
                skill_other: formData.skill_other,
                emergency_contact: formData.emergency_contact || null,
                referred_by: formData.referred_by || null,
                pronouns: formData.pronouns || null,
                male: formData.male,
                onboarding_completed: formData.onboarding_completed,
                seasons_list: formData.seasons_list || "false",
                notification_list: formData.notification_list || "false",
                captain_eligible: formData.captain_eligible
            })

            if (result.status) {
                setMessage({ text: result.message, type: "success" })
            } else {
                setMessage({ text: result.message, type: "error" })
            }
        })
    }

    const handlePictureUpload = () => {
        if (!originalId) {
            return
        }

        if (!pictureFile) {
            setPictureMessage({
                text: "Select an image file before uploading.",
                type: "error"
            })
            return
        }

        if (!pictureFile.type.startsWith("image/")) {
            setPictureMessage({
                text: "Only image files are supported.",
                type: "error"
            })
            return
        }

        if (pictureFile.size > maxSourcePictureUploadBytes) {
            setPictureMessage({
                text: "Image must be 25MB or smaller before compression.",
                type: "error"
            })
            return
        }

        const fileToUpload = pictureFile
        setPictureMessage(null)

        startPictureUploadTransition(async () => {
            let processedImage: { blob: Blob }
            try {
                processedImage = await compressImageForUpload(fileToUpload)
            } catch (error) {
                console.error("Image compression failed:", error)
                setPictureMessage({
                    text: "Could not process that image. Please try another photo.",
                    type: "error"
                })
                return
            }

            const uploadStart = await createPlayerPictureUpload(originalId)
            if (
                !uploadStart.status ||
                !uploadStart.uploadUrl ||
                !uploadStart.pictureFilename
            ) {
                setPictureMessage({
                    text: uploadStart.message || "Failed to start upload.",
                    type: "error"
                })
                return
            }

            const uploadResponse = await fetch(uploadStart.uploadUrl, {
                method: "PUT",
                headers: {
                    "Content-Type": "image/jpeg"
                },
                body: processedImage.blob
            })

            if (!uploadResponse.ok) {
                setPictureMessage({
                    text: "Upload to storage failed. Please try again.",
                    type: "error"
                })
                return
            }

            const finalizeResult = await finalizePlayerPictureUpload(
                originalId,
                uploadStart.pictureFilename
            )

            if (!finalizeResult.status) {
                setPictureMessage({
                    text: finalizeResult.message,
                    type: "error"
                })
                return
            }

            setFormData((current) =>
                current
                    ? {
                          ...current,
                          picture:
                              finalizeResult.picturePath ||
                              `/playerpics/${uploadStart.pictureFilename}`
                      }
                    : current
            )
            setPictureFile(null)
            if (fileInputRef.current) {
                fileInputRef.current.value = ""
            }
            setPictureMessage({
                text: finalizeResult.message,
                type: "success"
            })
        })
    }

    const handleSignupTextChange = (
        field: keyof SignupFormData,
        value: string
    ) => {
        if (!signupData) return
        setSignupData({ ...signupData, [field]: value })
    }

    const handleSignupBooleanChange = (
        field: keyof SignupFormData,
        value: boolean
    ) => {
        if (!signupData) return
        setSignupData({ ...signupData, [field]: value })
    }

    const handleSignupSave = () => {
        if (!signupData) return

        startSignupTransition(async () => {
            const result = await updateSignup(signupData.id, {
                age: signupData.age || null,
                captain: signupData.captain || null,
                pair: signupData.pair,
                pair_pick: signupData.pair_pick || null,
                pair_reason: signupData.pair_reason || null,
                dates_missing: signupData.dates_missing || null,
                play_1st_week: signupData.play_1st_week,
                amount_paid: signupData.amount_paid || null
            })

            if (result.status) {
                setSignupMessage({ text: result.message, type: "success" })
            } else {
                setSignupMessage({ text: result.message, type: "error" })
            }
        })
    }

    const textFields: { key: keyof FormData; label: string }[] = [
        { key: "id", label: "ID" },
        { key: "first_name", label: "First Name" },
        { key: "last_name", label: "Last Name" },
        { key: "preffered_name", label: "Preferred Name" },
        { key: "name", label: "Display Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "pronouns", label: "Pronouns" },
        { key: "role", label: "Role" },
        { key: "experience", label: "Experience" },
        { key: "assessment", label: "Assessment" },
        { key: "emergency_contact", label: "Emergency Contact" },
        { key: "referred_by", label: "Referred By" },
        { key: "image", label: "Image URL" },
        { key: "avatar", label: "Avatar" },
        { key: "avatarUrl", label: "Avatar URL" },
        { key: "picture", label: "Picture" }
    ]

    const intFields: { key: keyof FormData; label: string }[] = [
        { key: "old_id", label: "Old ID" },
        { key: "height", label: "Height (inches)" }
    ]

    const boolFields: { key: keyof FormData; label: string }[] = [
        { key: "emailVerified", label: "Email Verified" },
        { key: "skill_setter", label: "Skill: Setter" },
        { key: "skill_hitter", label: "Skill: Hitter" },
        { key: "skill_passer", label: "Skill: Passer" },
        { key: "skill_other", label: "Skill: Other" },
        { key: "male", label: "Male" },
        { key: "onboarding_completed", label: "Onboarding Completed" },
        { key: "captain_eligible", label: "Captain Eligible" }
    ]

    const membershipFields: { key: keyof FormData; label: string }[] = [
        { key: "seasons_list", label: "Seasons List" },
        { key: "notification_list", label: "Notification List" }
    ]

    return (
        <div className="space-y-6">
            <div className="max-w-md">
                <Label className="mb-2 block">Select Player</Label>
                <UserCombobox
                    users={users}
                    value={selectedUserId}
                    onChange={handleUserSelect}
                    placeholder="Search for a player..."
                />
            </div>

            {loading && (
                <p className="text-muted-foreground text-sm">
                    Loading player details...
                </p>
            )}

            {message && (
                <div
                    className={`rounded-md p-4 ${
                        message.type === "success"
                            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                    }`}
                >
                    {message.text}
                </div>
            )}

            {formData && (
                <div className="space-y-8">
                    <div className="space-y-3 rounded-md border p-4">
                        <h3 className="font-medium text-sm">Player Picture</h3>

                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                            <div>
                                {playerPicUrl && formData.picture ? (
                                    <img
                                        src={`${playerPicUrl}${formData.picture}`}
                                        alt={formData.name || "Player"}
                                        className="h-44 w-32 rounded-md border object-cover"
                                    />
                                ) : (
                                    <div className="flex h-44 w-32 items-center justify-center rounded-md border text-muted-foreground text-xs">
                                        No picture
                                    </div>
                                )}
                            </div>

                            <div className="w-full max-w-md space-y-2">
                                <Label htmlFor="player_picture_upload">
                                    Upload image (auto-compressed)
                                </Label>
                                <Input
                                    id="player_picture_upload"
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={(event) => {
                                        const file =
                                            event.target.files?.[0] ?? null
                                        setPictureFile(file)
                                        setPictureMessage(null)
                                    }}
                                    disabled={isPictureUploadPending}
                                />
                                <Button
                                    type="button"
                                    onClick={handlePictureUpload}
                                    disabled={
                                        isPictureUploadPending || !pictureFile
                                    }
                                >
                                    {isPictureUploadPending
                                        ? "Uploading..."
                                        : "Upload Picture"}
                                </Button>
                            </div>
                        </div>

                        {pictureMessage && (
                            <div
                                className={`rounded-md p-3 text-sm ${
                                    pictureMessage.type === "success"
                                        ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                        : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                                }`}
                            >
                                {pictureMessage.text}
                            </div>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {textFields.map((field) => {
                            const isReadOnly = readOnlyFields.has(field.key)
                            return (
                                <div key={field.key}>
                                    <Label
                                        htmlFor={field.key}
                                        className="mb-1 block"
                                    >
                                        {field.label}
                                    </Label>
                                    <Input
                                        id={field.key}
                                        value={
                                            (formData[field.key] as string) ??
                                            ""
                                        }
                                        onChange={(e) =>
                                            handleTextChange(
                                                field.key,
                                                e.target.value
                                            )
                                        }
                                        disabled={isReadOnly}
                                    />
                                </div>
                            )
                        })}

                        {intFields.map((field) => (
                            <div key={field.key}>
                                <Label
                                    htmlFor={field.key}
                                    className="mb-1 block"
                                >
                                    {field.label}
                                </Label>
                                <Input
                                    id={field.key}
                                    type="number"
                                    value={
                                        (formData[field.key] as string) ?? ""
                                    }
                                    onChange={(e) =>
                                        handleTextChange(
                                            field.key,
                                            e.target.value
                                        )
                                    }
                                />
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {membershipFields.map((field) => (
                            <div key={field.key}>
                                <Label
                                    htmlFor={field.key}
                                    className="mb-1 block"
                                >
                                    {field.label}
                                </Label>
                                <Select
                                    value={
                                        (formData[field.key] as string) || ""
                                    }
                                    onValueChange={(value) =>
                                        handleTextChange(field.key, value)
                                    }
                                >
                                    <SelectTrigger id={field.key}>
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {googleMembershipOptions.map(
                                            (option) => (
                                                <SelectItem
                                                    key={`${field.key}-${option.value}`}
                                                    value={option.value}
                                                >
                                                    {option.value} -{" "}
                                                    {option.label}
                                                </SelectItem>
                                            )
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-medium text-sm">Toggles</h3>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {boolFields.map((field) => (
                                <div
                                    key={field.key}
                                    className="flex items-center gap-3"
                                >
                                    <Switch
                                        id={field.key}
                                        checked={formData[field.key] as boolean}
                                        onCheckedChange={(checked) =>
                                            handleBooleanChange(
                                                field.key,
                                                checked
                                            )
                                        }
                                    />
                                    <Label htmlFor={field.key}>
                                        {field.label}
                                    </Label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <Label className="mb-1 block">Created At</Label>
                            <Input value={formData.createdAt} disabled />
                        </div>
                        <div>
                            <Label className="mb-1 block">Updated At</Label>
                            <Input value={formData.updatedAt} disabled />
                        </div>
                    </div>

                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            )}

            {signupData && (
                <div className="space-y-6 border-t pt-6">
                    <h2 className="font-semibold text-lg">
                        Current Season Signup ({signupData.seasonLabel})
                    </h2>

                    {signupMessage && (
                        <div
                            className={`rounded-md p-4 ${
                                signupMessage.type === "success"
                                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                            }`}
                        >
                            {signupMessage.text}
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="signup_age" className="mb-1 block">
                                Age
                            </Label>
                            <Input
                                id="signup_age"
                                value={signupData.age}
                                onChange={(e) =>
                                    handleSignupTextChange(
                                        "age",
                                        e.target.value
                                    )
                                }
                            />
                        </div>
                        <div>
                            <Label
                                htmlFor="signup_captain"
                                className="mb-1 block"
                            >
                                Captain
                            </Label>
                            <Select
                                value={signupData.captain}
                                onValueChange={(value) =>
                                    handleSignupTextChange("captain", value)
                                }
                            >
                                <SelectTrigger id="signup_captain">
                                    <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="yes">Yes</SelectItem>
                                    <SelectItem value="no">No</SelectItem>
                                    <SelectItem value="only_if_needed">
                                        If Needed
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label
                                htmlFor="signup_pair_pick"
                                className="mb-1 block"
                            >
                                Pair Pick (User ID)
                            </Label>
                            <Input
                                id="signup_pair_pick"
                                value={signupData.pair_pick}
                                onChange={(e) =>
                                    handleSignupTextChange(
                                        "pair_pick",
                                        e.target.value
                                    )
                                }
                            />
                        </div>
                        <div>
                            <Label
                                htmlFor="signup_pair_reason"
                                className="mb-1 block"
                            >
                                Pair Reason
                            </Label>
                            <Input
                                id="signup_pair_reason"
                                value={signupData.pair_reason}
                                onChange={(e) =>
                                    handleSignupTextChange(
                                        "pair_reason",
                                        e.target.value
                                    )
                                }
                            />
                        </div>
                        <div>
                            <Label
                                htmlFor="signup_dates_missing"
                                className="mb-1 block"
                            >
                                Dates Missing
                            </Label>
                            <Input
                                id="signup_dates_missing"
                                value={signupData.dates_missing}
                                onChange={(e) =>
                                    handleSignupTextChange(
                                        "dates_missing",
                                        e.target.value
                                    )
                                }
                            />
                        </div>
                        <div>
                            <Label
                                htmlFor="signup_amount_paid"
                                className="mb-1 block"
                            >
                                Amount Paid
                            </Label>
                            <Input
                                id="signup_amount_paid"
                                value={signupData.amount_paid}
                                onChange={(e) =>
                                    handleSignupTextChange(
                                        "amount_paid",
                                        e.target.value
                                    )
                                }
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="flex items-center gap-3">
                            <Switch
                                id="signup_pair"
                                checked={signupData.pair}
                                onCheckedChange={(checked) =>
                                    handleSignupBooleanChange("pair", checked)
                                }
                            />
                            <Label htmlFor="signup_pair">Wants Pair</Label>
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch
                                id="signup_play_1st_week"
                                checked={signupData.play_1st_week}
                                onCheckedChange={(checked) =>
                                    handleSignupBooleanChange(
                                        "play_1st_week",
                                        checked
                                    )
                                }
                            />
                            <Label htmlFor="signup_play_1st_week">
                                Play 1st Week
                            </Label>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <Label className="mb-1 block">Order ID</Label>
                            <Input value={signupData.order_id} disabled />
                        </div>
                        <div>
                            <Label className="mb-1 block">Signup Date</Label>
                            <Input value={signupData.created_at} disabled />
                        </div>
                    </div>

                    <Button
                        onClick={handleSignupSave}
                        disabled={isSignupPending}
                    >
                        {isSignupPending ? "Saving..." : "Save Signup Changes"}
                    </Button>
                </div>
            )}
        </div>
    )
}
