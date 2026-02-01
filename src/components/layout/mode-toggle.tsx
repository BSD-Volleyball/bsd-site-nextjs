"use client"

import { motion } from "framer-motion"
import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { Button } from "../ui/button"

export function ModeToggle() {
    const { resolvedTheme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const toggleTheme = () => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    const isDark = mounted && resolvedTheme === "dark"

    return (
        <Button
            variant="outline"
            size="icon"
            className="relative size-10 overflow-hidden rounded-full"
            onClick={toggleTheme}
        >
            <motion.div
                initial={false}
                animate={{
                    rotate: isDark ? 180 : 0,
                    scale: isDark ? 0 : 1
                }}
                transition={{
                    duration: 0.3,
                    ease: "easeInOut"
                }}
                className="absolute"
            >
                <SunIcon className="h-[1.2rem] w-[1.2rem]" />
            </motion.div>
            <motion.div
                initial={false}
                animate={{
                    rotate: isDark ? 0 : -180,
                    scale: isDark ? 1 : 0
                }}
                transition={{
                    duration: 0.3,
                    ease: "easeInOut"
                }}
                className="absolute"
            >
                <MoonIcon className="h-[1.2rem] w-[1.2rem]" />
            </motion.div>
            <span className="sr-only">Toggle theme</span>
        </Button>
    )
}
