"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type * as React from "react"
import { NavUser } from "@/components/layout/nav-user"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader
} from "@/components/ui/sidebar"
import { site } from "@/config/site"
import type { SidebarData } from "@/app/dashboard/sidebar-actions"
import { buildSidebarSections } from "@/components/layout/sidebar-sections"
import {
    HiddenPagesGroup,
    HistoricalNavGroup,
    NavSectionGroup
} from "@/components/layout/sidebar-nav-menu"

function SidebarLogo() {
    return (
        <div className="flex gap-2 px-2 transition-[padding] duration-300 ease-out group-data-[collapsible=icon]:px-0">
            <Link
                className="group/logo inline-flex items-center gap-2 transition-all duration-300 ease-out"
                href="/?stay=1"
            >
                <span className="sr-only">{site.name}</span>
                <Image
                    src={site.logo}
                    alt={site.name}
                    width={30}
                    height={30}
                    className="transition-transform duration-300 ease-out group-data-[collapsible=icon]:scale-110"
                />
                <span className="font-bold text-sm leading-tight transition-[margin,opacity,transform,width] duration-300 ease-out group-data-[collapsible=icon]:-ml-2 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:scale-95 group-data-[collapsible=icon]:opacity-0">
                    Bump Set Drink
                    <br />
                    Volleyball
                </span>
            </Link>
        </div>
    )
}

/**
 * The dashboard sidebar. Which groups and links a viewer sees is decided in
 * buildSidebarSections (sidebar-sections.ts); this component only lays the
 * groups out: the sections down to Account, Historical, the admin groups,
 * then the admin-only "All Hidden Pages" listing.
 */
export function AppSidebar({
    data,
    ...props
}: React.ComponentProps<typeof Sidebar> & { data: SidebarData }) {
    const pathname = usePathname()
    const { sections, adminSections, hiddenGroups } = buildSidebarSections(data)

    return (
        <Sidebar collapsible="icon" variant="inset" {...props}>
            <SidebarHeader className="mb-4 h-13 justify-center max-md:mt-2">
                <SidebarLogo />
            </SidebarHeader>
            <SidebarContent className="-mt-2">
                {sections.map((section) => (
                    <NavSectionGroup
                        key={section.label}
                        section={section}
                        pathname={pathname}
                    />
                ))}

                <HistoricalNavGroup
                    historicalNav={data.historicalNav}
                    pathname={pathname}
                />

                {adminSections.map((section) => (
                    <NavSectionGroup
                        key={section.label}
                        section={section}
                        pathname={pathname}
                    />
                ))}

                {hiddenGroups && (
                    <HiddenPagesGroup
                        groups={hiddenGroups}
                        pathname={pathname}
                    />
                )}
            </SidebarContent>
            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    )
}
