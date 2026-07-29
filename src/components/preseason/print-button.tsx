"use client"

import { Button } from "@/components/ui/button"
import { RiPrinterLine } from "@remixicon/react"

export function PrintButton() {
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 print:hidden"
            onClick={() => window.print()}
        >
            <RiPrinterLine className="mr-1.5 h-4 w-4" />
            Print
        </Button>
    )
}
