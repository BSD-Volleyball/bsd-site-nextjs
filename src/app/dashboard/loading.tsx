import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

function CardSkeleton() {
    return (
        <Card className="min-w-[280px] flex-1">
            <CardHeader className="pb-3">
                <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 w-28" />
            </CardContent>
        </Card>
    )
}

export default function DashboardLoading() {
    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="space-y-1.5">
                <Skeleton className="h-7 w-64" />
                <Skeleton className="h-4 w-80" />
            </div>

            {/* Card grid */}
            <div className="flex flex-wrap gap-6">
                <CardSkeleton />
                <CardSkeleton />
            </div>

            {/* Previous seasons / secondary cards */}
            <div className="flex flex-wrap gap-6">
                <CardSkeleton />
            </div>
        </div>
    )
}
