"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SignupEntry } from "./actions"
import { getDisplayName } from "./signup-display-name"

interface AccountingCardProps {
    signups: SignupEntry[]
    lateAmount: string
}

export function AccountingCard({ signups, lateAmount }: AccountingCardProps) {
    const totalPaid = useMemo(() => {
        return signups.reduce((sum, entry) => {
            if (!entry.amountPaid) return sum
            const amount = Number.parseFloat(entry.amountPaid)
            return Number.isFinite(amount) ? sum + amount : sum
        }, 0)
    }, [signups])

    const discountUsage = useMemo(() => {
        return signups
            .filter((entry) => entry.discountCodeName)
            .map((entry) => ({
                signupId: entry.signupId,
                playerName: getDisplayName(entry),
                discountCodeName: entry.discountCodeName as string,
                amountPaid: Number.parseFloat(entry.amountPaid || "0")
            }))
            .sort((a, b) => a.playerName.localeCompare(b.playerName))
    }, [signups])

    const discountUsageTotalPaid = useMemo(() => {
        return discountUsage.reduce((sum, entry) => {
            return Number.isFinite(entry.amountPaid)
                ? sum + entry.amountPaid
                : sum
        }, 0)
    }, [discountUsage])

    const lateFeeUsers = useMemo(() => {
        const lateAmountValue = Number.parseFloat(lateAmount)
        if (!Number.isFinite(lateAmountValue)) {
            return [] as Array<{
                signupId: number
                playerName: string
                amountPaid: number
            }>
        }

        return signups
            .map((entry) => ({
                signupId: entry.signupId,
                playerName: getDisplayName(entry),
                amountPaid: Number.parseFloat(entry.amountPaid || "")
            }))
            .filter(
                (entry) =>
                    Number.isFinite(entry.amountPaid) &&
                    Math.abs(entry.amountPaid - lateAmountValue) < 0.005
            )
            .sort((a, b) => a.playerName.localeCompare(b.playerName))
    }, [signups, lateAmount])

    const totalPaidDisplay = useMemo(
        () =>
            new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD"
            }).format(totalPaid),
        [totalPaid]
    )

    const discountUsageTotalPaidDisplay = useMemo(
        () =>
            new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD"
            }).format(discountUsageTotalPaid),
        [discountUsageTotalPaid]
    )

    const lateAmountDisplay = useMemo(() => {
        const lateAmountValue = Number.parseFloat(lateAmount)
        if (!Number.isFinite(lateAmountValue)) {
            return "Not configured"
        }

        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
        }).format(lateAmountValue)
    }, [lateAmount])

    return (
        <Card>
            <CardHeader>
                <CardTitle>Accounting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-md border bg-muted/30 p-4">
                    <p className="text-muted-foreground text-sm">
                        Total Paid This Season
                    </p>
                    <p className="font-semibold text-2xl">{totalPaidDisplay}</p>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm">
                            Discount Code Usage
                        </h3>
                        <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-xs">
                            {discountUsage.length} user
                            {discountUsage.length !== 1 && "s"}
                        </span>
                    </div>
                    <p className="text-muted-foreground text-sm">
                        Total paid by discount users:{" "}
                        {discountUsageTotalPaidDisplay}
                    </p>
                    {discountUsage.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No signups used a discount code.
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50">
                                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                            Player
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                            Discount Code
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                            Amount Paid
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {discountUsage.map((entry) => (
                                        <tr
                                            key={entry.signupId}
                                            className="border-b last:border-0"
                                        >
                                            <td className="px-3 py-2">
                                                {entry.playerName}
                                            </td>
                                            <td className="px-3 py-2">
                                                {entry.discountCodeName}
                                            </td>
                                            <td className="px-3 py-2">
                                                {new Intl.NumberFormat(
                                                    "en-US",
                                                    {
                                                        style: "currency",
                                                        currency: "USD"
                                                    }
                                                ).format(entry.amountPaid)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm">
                            Late Fee Payments
                        </h3>
                        <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-xs">
                            {lateFeeUsers.length} user
                            {lateFeeUsers.length !== 1 && "s"}
                        </span>
                    </div>
                    <p className="text-muted-foreground text-sm">
                        Late fee amount: {lateAmountDisplay}
                    </p>
                    {lateFeeUsers.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No users paid the late fee amount.
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50">
                                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                            Player
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                            Amount Paid
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lateFeeUsers.map((entry) => (
                                        <tr
                                            key={entry.signupId}
                                            className="border-b last:border-0"
                                        >
                                            <td className="px-3 py-2">
                                                {entry.playerName}
                                            </td>
                                            <td className="px-3 py-2">
                                                {new Intl.NumberFormat(
                                                    "en-US",
                                                    {
                                                        style: "currency",
                                                        currency: "USD"
                                                    }
                                                ).format(entry.amountPaid)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
