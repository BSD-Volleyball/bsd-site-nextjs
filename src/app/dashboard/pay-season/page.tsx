import { PageHeader } from "@/components/layout/page-header"
import { SeasonPaymentForm } from "./payment-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Pay for Season"
}

export default function PaySeasonPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Season Registration"
                description="Complete your payment to register for the upcoming volleyball season."
            />
            <SeasonPaymentForm />
        </div>
    )
}
