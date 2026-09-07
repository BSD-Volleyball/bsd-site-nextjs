"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { CreditCard, PaymentForm } from "react-square-web-payments-sdk"
import { toast } from "sonner"
import { RiCheckLine } from "@remixicon/react"
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
import { Textarea } from "@/components/ui/textarea"
import { StatusBanner } from "@/components/ui/status-banner"
import { SponsorLogoUploader } from "@/components/sponsors/sponsor-logo-uploader"
import type { UserSponsorship } from "@/lib/sponsors"
import {
    type SponsorshipPaymentResult,
    createMySponsorLogoUpload,
    finalizeMySponsorLogoUpload,
    submitSponsorshipPayment,
    updateMySponsorDetails
} from "./actions"

interface Props {
    sponsorship: UserSponsorship
    seasonLabel: string
    squareAppId: string
    squareLocationId: string
}

export function SponsorshipView({
    sponsorship,
    seasonLabel,
    squareAppId,
    squareLocationId
}: Props) {
    const router = useRouter()
    const { resolvedTheme } = useTheme()

    const [name, setName] = useState(sponsorship.name)
    const [website, setWebsite] = useState(sponsorship.website ?? "")
    const [blurb, setBlurb] = useState(sponsorship.blurb ?? "")
    const [saving, setSaving] = useState(false)

    const [processing, setProcessing] = useState(false)
    const [paymentResult, setPaymentResult] =
        useState<SponsorshipPaymentResult | null>(null)

    async function handleSaveDetails() {
        setSaving(true)
        const result = await updateMySponsorDetails({
            name,
            website: website || null,
            blurb: blurb || null
        })
        setSaving(false)
        if (result.status) {
            toast.success(result.message ?? "Details saved.")
            router.refresh()
        } else {
            toast.error(result.message)
        }
    }

    const isPaid = sponsorship.status === "paid" || paymentResult?.status

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Business Details</CardTitle>
                    <CardDescription>
                        Shown on our public sponsors page and used for your logo
                        on the championship t-shirt.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <SponsorLogoUploader
                        sponsorId={sponsorship.sponsorId}
                        sponsorName={sponsorship.name}
                        logoUrl={sponsorship.logoUrl}
                        startUpload={(_sponsorId, type, length) =>
                            createMySponsorLogoUpload(type, length)
                        }
                        finishUpload={(_sponsorId, filename) =>
                            finalizeMySponsorLogoUpload(filename)
                        }
                        onUploaded={() => router.refresh()}
                    />
                    <div className="space-y-2">
                        <Label htmlFor="sp-name">Business name</Label>
                        <Input
                            id="sp-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={120}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="sp-website">Website</Label>
                        <Input
                            id="sp-website"
                            placeholder="https://yourbusiness.com"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="sp-blurb">
                            Short blurb{" "}
                            <span className="text-muted-foreground">
                                ({blurb.length}/500)
                            </span>
                        </Label>
                        <Textarea
                            id="sp-blurb"
                            rows={3}
                            maxLength={500}
                            placeholder="A sentence or two about your business."
                            value={blurb}
                            onChange={(e) => setBlurb(e.target.value)}
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSaveDetails} disabled={saving}>
                        {saving ? "Saving…" : "Save details"}
                    </Button>
                </CardFooter>
            </Card>

            <Card
                className={
                    isPaid
                        ? "border-green-300 dark:border-green-800"
                        : "border-amber-300 dark:border-amber-700"
                }
            >
                <CardHeader>
                    <div className="flex items-center gap-2">
                        {isPaid && (
                            <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                                <RiCheckLine className="h-5 w-5 text-green-600 dark:text-green-400" />
                            </div>
                        )}
                        <CardTitle>
                            {isPaid ? "Sponsorship Paid" : "Pay Sponsorship"}
                        </CardTitle>
                    </div>
                    <CardDescription>
                        {seasonLabel} season sponsorship for {sponsorship.name}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-baseline justify-between rounded-md bg-muted/50 px-4 py-3">
                        <span className="text-muted-foreground text-sm">
                            {isPaid ? "Amount paid" : "Amount due"}
                        </span>
                        <span className="font-bold text-2xl tabular-nums">
                            ${sponsorship.amountPaid ?? sponsorship.amount}
                        </span>
                    </div>

                    {isPaid ? (
                        <div className="space-y-3 text-sm">
                            <p className="text-muted-foreground">
                                {paymentResult?.message ??
                                    (sponsorship.paymentMethod === "manual"
                                        ? "Recorded by the league. Thank you for your support!"
                                        : "Paid by card. Thank you for your support!")}
                            </p>
                            {(paymentResult?.receiptUrl ??
                                sponsorship.receiptUrl) && (
                                <a
                                    href={
                                        paymentResult?.receiptUrl ??
                                        sponsorship.receiptUrl ??
                                        "#"
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block text-primary underline"
                                >
                                    View Square receipt
                                </a>
                            )}
                        </div>
                    ) : (
                        <>
                            {paymentResult && !paymentResult.status && (
                                <StatusBanner
                                    variant={
                                        paymentResult.paymentId
                                            ? "warning"
                                            : "error"
                                    }
                                >
                                    {paymentResult.message}
                                </StatusBanner>
                            )}
                            {resolvedTheme == null ? null : (
                                <PaymentForm
                                    key={resolvedTheme}
                                    applicationId={squareAppId}
                                    locationId={squareLocationId}
                                    cardTokenizeResponseReceived={async (
                                        tokenResult
                                    ) => {
                                        if (tokenResult.status !== "OK") {
                                            setPaymentResult({
                                                status: false,
                                                message:
                                                    "Failed to process card. Please try again."
                                            })
                                            return
                                        }
                                        setProcessing(true)
                                        setPaymentResult(null)
                                        try {
                                            const result =
                                                await submitSponsorshipPayment(
                                                    tokenResult.token
                                                )
                                            setPaymentResult(result)
                                            if (result.status) {
                                                router.refresh()
                                            }
                                        } catch {
                                            setPaymentResult({
                                                status: false,
                                                message:
                                                    "An unexpected error occurred. Please try again."
                                            })
                                        } finally {
                                            setProcessing(false)
                                        }
                                    }}
                                    createPaymentRequest={() => ({
                                        countryCode: "US",
                                        currencyCode: "USD",
                                        total: {
                                            amount: sponsorship.amount,
                                            label: `${seasonLabel} Sponsorship`
                                        }
                                    })}
                                >
                                    <CreditCard
                                        style={{
                                            ".input-container": {
                                                borderColor: "#e4e4e7",
                                                borderRadius: "6px"
                                            },
                                            ".input-container.is-focus": {
                                                borderColor: "#7c3aed"
                                            },
                                            input: {
                                                backgroundColor: "#ffffff",
                                                color: "#09090b",
                                                fontSize: "14px"
                                            },
                                            "input::placeholder": {
                                                color: "#71717a"
                                            },
                                            ".message-text": {
                                                color: "#71717a"
                                            },
                                            ".message-icon": {
                                                color: "#71717a"
                                            }
                                        }}
                                        buttonProps={{
                                            isLoading: processing,
                                            css: {
                                                backgroundColor: "#7c3aed",
                                                color: "#ffffff",
                                                fontSize: "14px",
                                                fontWeight: "500",
                                                "&:hover": {
                                                    backgroundColor: "#6d28d9"
                                                }
                                            }
                                        }}
                                    >
                                        Pay ${sponsorship.amount}
                                    </CreditCard>
                                </PaymentForm>
                            )}
                            <p className="text-muted-foreground text-xs">
                                Prefer to pay by check? Contact the league and
                                we&apos;ll mark your sponsorship paid once it
                                arrives.
                            </p>
                        </>
                    )}
                </CardContent>
                {!isPaid && (
                    <CardFooter>
                        <p className="text-muted-foreground text-sm">
                            Your payment is securely processed by Square. We do
                            not store your card details.
                        </p>
                    </CardFooter>
                )}
            </Card>
        </div>
    )
}
