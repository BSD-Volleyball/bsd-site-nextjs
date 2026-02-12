"use client"

import Link from "next/link"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar
} from "@/components/ui/sidebar"

import {
    RiFindReplaceLine,
    RiLogoutCircleLine,
    RiMore2Line,
    RiTimer2Line,
    RiHomeLine,
    RiUserLine,
    RiLockLine
} from "@remixicon/react"

import { authClient } from "@/lib/auth-client"

// Better Auth UI Profile types
interface Profile {
    emailVerified?: boolean | null
    isAnonymous?: boolean | null
    fullName?: string | null
    first_name?: string | null
    last_name?: string | null
    preffered_name?: string | null
    displayName?: string | null
    username?: string | null
    displayUsername?: string | null
    name?: string | null
    email?: string | null
    id?: string | number
}

export function NavUser() {
    const { isMobile } = useSidebar()

    // Use Better Auth session hook to get real user data
    const { data: session, isPending } = authClient.useSession()

    // Handle sign out
    const handleSignOut = async () => {
        try {
            await authClient.signOut({
                fetchOptions: {
                    onSuccess: () => {
                        window.location.href = "/"
                    }
                }
            })
        } catch (error) {
            console.error("Sign out error:", error)
        }
    }

    // Show loading state or return null if no session
    if (isPending) {
        return (
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton>
                        <Avatar className="in-data-[state=expanded]:size-6 transition-[width,height] duration-200 ease-in-out">
                            <AvatarFallback>...</AvatarFallback>
                        </Avatar>
                        <div className="ms-1 grid flex-1 text-left text-sm leading-tight">
                            <span className="truncate font-medium">
                                Loading...
                            </span>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        )
    }

    if (!session?.user) {
        return null
    }

    const user = session.user as Profile

    // Get user's display name with fallbacks
    const firstName = user.preffered_name || user.first_name
    const fullName =
        firstName && user.last_name
            ? `${firstName} ${user.last_name}`.trim()
            : null
    const displayName = fullName || firstName || "User"

    // Generate initials
    const initials =
        displayName
            .split(" ")
            .map((name) => name.charAt(0))
            .join("")
            .toUpperCase()
            .slice(0, 2) || "U"

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:active:bg-transparent group-data-[collapsible=icon]:hover:bg-transparent"
                        >
                            <Avatar className="in-data-[state=expanded]:size-6 transition-[width,height] duration-200 ease-in-out group-data-[collapsible=icon]:size-8">
                                <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                            <div className="ms-1 grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                                <span className="truncate font-medium">
                                    {displayName}
                                </span>
                                {user.email && (
                                    <span className="truncate text-muted-foreground text-xs">
                                        {user.email}
                                    </span>
                                )}
                            </div>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent/50 in-[[data-slot=dropdown-menu-trigger]:hover]:bg-transparent group-data-[collapsible=icon]:hidden">
                                <RiMore2Line
                                    className="size-5 opacity-40"
                                    size={20}
                                />
                            </div>
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        side={isMobile ? "bottom" : "right"}
                        align="end"
                        sideOffset={4}
                    >
                        <Link href="/dashboard">
                            <DropdownMenuItem className="gap-3 px-1">
                                <RiTimer2Line
                                    size={20}
                                    className="text-muted-foreground/70"
                                    aria-hidden="true"
                                />
                                <span>Dashboard</span>
                            </DropdownMenuItem>
                        </Link>
                        <Link href="/dashboard/account">
                            <DropdownMenuItem className="gap-3 px-1">
                                <RiUserLine
                                    size={20}
                                    className="text-muted-foreground/70"
                                    aria-hidden="true"
                                />
                                <span>Account</span>
                            </DropdownMenuItem>
                        </Link>
                        <Link href="/dashboard/security">
                            <DropdownMenuItem className="gap-3 px-1">
                                <RiLockLine
                                    size={20}
                                    className="text-muted-foreground/70"
                                    aria-hidden="true"
                                />
                                <span>Security</span>
                            </DropdownMenuItem>
                        </Link>
                        <DropdownMenuItem className="gap-3 px-1">
                            <RiFindReplaceLine
                                size={20}
                                className="text-muted-foreground/70"
                                aria-hidden="true"
                            />
                            <span>History</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <Link href="/">
                            <DropdownMenuItem className="gap-3 px-1">
                                <RiHomeLine
                                    size={20}
                                    className="text-muted-foreground/70"
                                    aria-hidden="true"
                                />
                                <span>Homepage</span>
                            </DropdownMenuItem>
                        </Link>

                        <DropdownMenuItem
                            className="cursor-pointer gap-3 px-1"
                            onClick={handleSignOut}
                        >
                            <RiLogoutCircleLine
                                size={20}
                                className="text-muted-foreground/70"
                                aria-hidden="true"
                            />
                            <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
