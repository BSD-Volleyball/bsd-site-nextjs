"use client"

import { useState } from "react"
import { CreditCard, PaymentForm } from "react-square-web-payments-sdk"
import { submitSeasonPayment, type PaymentResult } from "./actions"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { RiCheckLine, RiErrorWarningLine } from "@remixicon/react"

export function SeasonPaymentForm() {
    const [isProcessing, setIsProcessing] = useState(false)
    const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null)

    const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID!
    const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID!
    const amount = process.env.NEXT_PUBLIC_SEASON_AMOUNT || "100.00"

    if (paymentResult?.success) {
        return (
            <Card className="max-w-md">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                            <RiCheckLine className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                        <CardTitle>Payment Successful!</CardTitle>
                    </div>
                    <CardDescription>
                        Thank you for registering for the volleyball season.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-muted-foreground text-sm">
                        {paymentResult.message}
                    </p>
                    {paymentResult.receiptUrl && (
                        <a
                            href={paymentResult.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary text-sm underline"
                        >
                            View Receipt
                        </a>
                    )}
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="max-w-md">
            <CardHeader>
                <CardTitle>Season Registration</CardTitle>
                <CardDescription>
                    Pay ${amount} to register for the upcoming volleyball season.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted p-4">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Volleyball Season Fee</span>
                        <span className="font-semibold">${amount}</span>
                    </div>
                </div>

                {paymentResult && !paymentResult.success && (
                    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
                        <RiErrorWarningLine className="h-5 w-5" />
                        <span className="text-sm">{paymentResult.message}</span>
                    </div>
                )}

                <PaymentForm
                    applicationId={appId}
                    locationId={locationId}
                    cardTokenizeResponseReceived={async (tokenResult) => {
                        if (tokenResult.status !== "OK") {
                            setPaymentResult({
                                success: false,
                                message: "Failed to process card. Please try again."
                            })
                            return
                        }

                        setIsProcessing(true)
                        setPaymentResult(null)

                        try {
                            const result = await submitSeasonPayment(tokenResult.token)
                            setPaymentResult(result)
                        } catch (error) {
                            setPaymentResult({
                                success: false,
                                message: "An unexpected error occurred. Please try again."
                            })
                        } finally {
                            setIsProcessing(false)
                        }
                    }}
                    createPaymentRequest={() => ({
                        countryCode: "US",
                        currencyCode: "USD",
                        total: {
                            amount,
                            label: "Volleyball Season Registration"
                        }
                    })}
                >
                    <CreditCard
                        buttonProps={{
                            isLoading: isProcessing,
                            css: {
                                backgroundColor: "var(--primary)",
                                color: "var(--primary-foreground)",
                                fontSize: "14px",
                                fontWeight: "500",
                                "&:hover": {
                                    backgroundColor: "var(--primary)"
                                }
                            }
                        }}
                    />
                </PaymentForm>
            </CardContent>
            <CardFooter>
                <p className="text-muted-foreground text-xs">
                    Your payment is securely processed by Square. We do not store your card
                    details.
                </p>
            </CardFooter>
        </Card>
    )
}
