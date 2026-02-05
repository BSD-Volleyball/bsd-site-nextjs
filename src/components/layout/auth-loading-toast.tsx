"use client"

import { useEffect } from "react"
import { toast } from "sonner"

export function WelcomeToast() {
    useEffect(() => {
        const promise = () => new Promise((resolve) => setTimeout(() => resolve({ name: 'Sonner' }), 2000))

        toast.promise(promise, {
            loading: 'Authenticating...',
            success: 'Welcome 👋 You are now logged in.',
            error: 'Error',
        })
    }, [])

    return null
} 