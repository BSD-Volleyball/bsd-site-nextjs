import { RiCoupon3Line } from "@remixicon/react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { getActiveDiscountForUser } from "@/lib/discount"
import { isSeasonRegistrationOpen, type SeasonPhase } from "@/lib/season-phases"

type ActiveDiscount = NonNullable<
    Awaited<ReturnType<typeof getActiveDiscountForUser>>
>

export function DiscountCard({
    discount,
    phase
}: {
    discount: ActiveDiscount
    phase: SeasonPhase
}) {
    return (
        <Card className="min-w-[280px] flex-1 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiCoupon3Line className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <CardTitle className="text-green-700 text-lg dark:text-green-300">
                        Discount Available!
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    <p className="text-green-700 dark:text-green-300">
                        You have a{" "}
                        <span className="font-bold">
                            {discount.percentage}% discount
                        </span>{" "}
                        available for season registration.
                    </p>
                    {discount.expiration && (
                        <p className="text-green-600 text-sm dark:text-green-400">
                            Expires on{" "}
                            {new Date(discount.expiration).toLocaleDateString(
                                "en-US"
                            )}
                        </p>
                    )}
                    {isSeasonRegistrationOpen(phase) && (
                        <Link
                            href="/dashboard/pay-season"
                            className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 font-medium text-sm text-white hover:bg-green-700"
                        >
                            Use Discount Now
                        </Link>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
