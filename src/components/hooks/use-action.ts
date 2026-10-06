"use client"

import { useRouter } from "next/navigation"
import { useCallback, useTransition } from "react"
import { toast } from "sonner"
import type { ActionResult } from "@/lib/action-result"

interface UseActionOptions<T> {
    /**
     * Toast on success. Defaults to the action's own message (if it returned
     * one); a string or function overrides it; false shows nothing.
     */
    success?: string | ((data: T) => string) | false
    /** Re-render server components after success (default true). */
    refresh?: boolean
    onSuccess?: (data: T) => void
    onError?: (message: string) => void
}

/**
 * Run a server action from a client component with the boilerplate every
 * form repeats: a pending flag, an error toast, a success toast, and
 * router.refresh() so server-rendered data catches up.
 *
 * Built on useTransition, so `pending` ends however the action ends; a
 * hand-rolled setBusy(true) / await / setBusy(false) stays stuck "busy"
 * forever when the action throws or the network drops.
 *
 *   const { run, pending } = useAction(withdrawTournamentInterest, {
 *       onSuccess: () => setOpen(false)
 *   })
 *   <Button disabled={pending} onClick={() => run()}>Withdraw</Button>
 *
 * `run` resolves to the ActionResult, or null if the call itself failed.
 */
export function useAction<A extends unknown[], T>(
    action: (...args: A) => Promise<ActionResult<T>>,
    options: UseActionOptions<T> = {}
) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const { success, refresh = true, onSuccess, onError } = options

    const run = useCallback(
        (...args: A) =>
            new Promise<ActionResult<T> | null>((resolve) => {
                startTransition(async () => {
                    try {
                        const result = await action(...args)
                        if (result.status) {
                            const message =
                                success === false
                                    ? undefined
                                    : typeof success === "function"
                                      ? success(result.data)
                                      : (success ?? result.message)
                            if (message) toast.success(message)
                            onSuccess?.(result.data)
                            if (refresh) router.refresh()
                        } else {
                            toast.error(result.message)
                            onError?.(result.message)
                        }
                        resolve(result)
                    } catch {
                        const message =
                            "Something went wrong. Please try again."
                        toast.error(message)
                        onError?.(message)
                        resolve(null)
                    }
                })
            }),
        [action, success, refresh, onSuccess, onError, router]
    )

    return { run, pending }
}
