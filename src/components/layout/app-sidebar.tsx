"use client"

import { useEffect, useState } from "react"
import {
    RiLineChartLine,
    RiUser3Line,
    RiShieldLine,
    RiSpeedUpLine,
    RiBasketballLine,
    RiEditLine,
    RiSearchLine
} from "@remixicon/react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type * as React from "react"
import { NavUser } from "@/components/layout/nav-user"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem
} from "@/components/ui/sidebar"
import { site } from "@/config/site"
import { getSignupEligibility, getIsAdminOrDirector } from "@/app/dashboard/actions"

const baseNavItems = [
    { title: "Dashboard", url: "/dashboard", icon: RiSpeedUpLine },
    { title: "Volleyball Profile", url: "/dashboard/volleyball-profile", icon: RiBasketballLine },
    { title: "Account", url: "/dashboard/account", icon: RiUser3Line },
    { title: "Security", url: "/dashboard/security", icon: RiShieldLine },
    { title: "Analytics", url: "/dashboard/analytics", icon: RiLineChartLine }
]

const signupNavItem = {
    title: "Sign-up for Season",
    url: "/dashboard/pay-season",
    icon: RiEditLine
}

const playerLookupNavItem = {
    title: "Player Lookup",
    url: "/dashboard/player-lookup",
    icon: RiSearchLine
}

function SidebarLogo() {
    return (
        <div className="flex gap-2 px-2 transition-[padding] duration-300 ease-out group-data-[collapsible=icon]:px-0">
            <Link
                className="group/logo inline-flex items-center gap-2 transition-all duration-300 ease-out"
                href="/"
            >
                <span className="sr-only">{site.name}</span>
                <Image
                    src={site.logo}
                    alt={site.name}
                    width={30}
                    height={30}
                    className="transition-transform duration-300 ease-out group-data-[collapsible=icon]:scale-110"
                />
                <span className="group-data-[collapsible=icon]:-ml-2 font-bold text-sm leading-tight transition-[margin,opacity,transform,width] duration-300 ease-out group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:scale-95 group-data-[collapsible=icon]:opacity-0">
                    Bump Set Drink
                    <br />
                    Volleyball
                </span>
            </Link>
        </div>
    )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const pathname = usePathname()
    const [showSignupLink, setShowSignupLink] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)

    useEffect(() => {
        getSignupEligibility().then(setShowSignupLink)
        getIsAdminOrDirector().then(setIsAdmin)
    }, [pathname])

    // Build nav items dynamically
    let navItems = [...baseNavItems]

    // Insert signup after Dashboard if eligible
    if (showSignupLink) {
        navItems = [navItems[0], signupNavItem, ...navItems.slice(1)]
    }

    // Add Player Lookup at the end for admins/commish
    if (isAdmin) {
        navItems = [...navItems, playerLookupNavItem]
    }

    const data = {
        navMain: [
            {
                title: "General",
                items: navItems
            }
        ]
    }

    return (
        <Sidebar collapsible="icon" variant="inset" {...props}>
            <SidebarHeader className="mb-4 h-13 justify-center max-md:mt-2">
                <SidebarLogo />
            </SidebarHeader>
            <SidebarContent className="-mt-2">
                {data.navMain.map((group) => (
                    <SidebarGroup key={group.title}>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            {group.title}
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {group.items.map((item) => {
                                    const isActive = pathname === item.url

                                    return (
                                        <SidebarMenuItem key={item.title}>
                                            <SidebarMenuButton
                                                asChild
                                                className="group/menu-button group-data-[collapsible=icon]:px-1.25! h-9 gap-3 font-medium transition-all duration-300 ease-out [&>svg]:size-auto"
                                                tooltip={item.title}
                                                isActive={isActive}
                                            >
                                                <Link
                                                    href={item.url}
                                                    className="flex items-center gap-3"
                                                >
                                                    {item.icon && (
                                                        <item.icon
                                                            className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
                                                            size={22}
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                    <span>{item.title}</span>
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    )
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>
            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    )
}
