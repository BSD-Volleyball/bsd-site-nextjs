import Link from "next/link"
import { RiHandHeartLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { UserSponsorship } from "@/lib/sponsors"

interface Props {
    sponsorship: UserSponsorship
    seasonLabel: string
}

/**
 * Dashboard card for a sponsor contact. Amber while payment is due, green
 * once paid; both link to the sponsorship page for details and logo.
 */
export function SponsorshipCard({ sponsorship, seasonLabel }: Props) {
    const paid = sponsorship.status === "paid"

    return (
        <Card
            className={
                paid
                    ? "min-w-[280px] flex-1 border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950"
                    : "min-w-[280px] flex-1 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
            }
        >
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiHandHeartLine
                        className={
                            paid
                                ? "h-5 w-5 text-green-600 dark:text-green-400"
                                : "h-5 w-5 text-amber-600 dark:text-amber-400"
                        }
                    />
                    <CardTitle className="text-base">
                        {paid
                            ? "Thank You for Sponsoring!"
                            : "Sponsorship Payment Due"}
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {paid ? (
                    <p>
                        <strong>{sponsorship.name}</strong> is a {seasonLabel}{" "}
                        sponsor. Keep your logo and details current so they look
                        right on the site and the championship shirt.
                    </p>
                ) : (
                    <p>
                        <strong>{sponsorship.name}</strong> is set up as a{" "}
                        {seasonLabel} sponsor. Pay{" "}
                        <strong>${sponsorship.amount}</strong> by card and add
                        your logo and business details.
                    </p>
                )}
                <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                        <Link href="/dashboard/sponsorship">
                            {paid ? "Manage details" : "Pay & manage details"}
                        </Link>
                    </Button>
                    {paid && sponsorship.receiptUrl && (
                        <Button asChild size="sm" variant="outline">
                            <a
                                href={sponsorship.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Receipt
                            </a>
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
