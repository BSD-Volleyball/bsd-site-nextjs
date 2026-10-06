"use client"

import { type ReactNode, useSyncExternalStore } from "react"

// ---------------------------------------------------------------------------
// better-auth-ui's <SignedIn>/<SignedOut> render nothing while the session is
// pending, which is always the server's state. On a fast client the session
// fetch can resolve before React hydrates, so the first client render already
// knows the answer and disagrees with the server HTML: a hydration mismatch
// that makes React throw the tree away and re-render it (seen in CI on
// 2026-10-06 as a duplicated hero block). Gating those components on
// hydration keeps server and first client render identical (both empty), and
// the real state appears one render later, exactly as it did in the normal
// pending path.
// ---------------------------------------------------------------------------

const subscribe = () => () => {}

/** false during SSR and the hydration render, true afterwards. */
export function useHydrated(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => true,
        () => false
    )
}

/** Renders children only after hydration. */
export function Hydrated({ children }: { children: ReactNode }) {
    return useHydrated() ? children : null
}
