import { Skeleton } from "@/components/ui/skeleton"

export default function MarketingLoading() {
    return (
        <div className="container mx-auto space-y-6 px-4 py-12">
            <Skeleton className="mx-auto h-9 w-72" />
            <Skeleton className="mx-auto h-5 w-96 max-w-full" />
            <div className="mx-auto max-w-3xl space-y-3 pt-6">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        </div>
    )
}
