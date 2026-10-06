"use client"

import { formatSeasonRowLabel } from "@/lib/season-utils"
import { RiArrowDownSLine, RiCalendarLine, RiMedalLine } from "@remixicon/react"
import Link from "next/link"
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton
} from "@/components/ui/sidebar"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent
} from "@/components/ui/collapsible"
import type {
    SidebarData,
    SeasonNavItem,
    TournamentNavItem
} from "@/app/dashboard/sidebar-actions"
import {
    hallOfChampionsNavItem,
    type NavItem,
    seasonCategories,
    seasonHistoryNavItem,
    tournamentCategories
} from "@/components/layout/sidebar-nav-config"
import type { NavSection } from "@/components/layout/sidebar-sections"

function NavItems({ items, pathname }: { items: NavItem[]; pathname: string }) {
    return (
        <>
            {items.map((item) => {
                const isActive = item.activePrefix
                    ? pathname.startsWith(item.activePrefix)
                    : pathname === item.url

                return (
                    <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                            asChild
                            className="group/menu-button h-9 gap-3 font-medium transition-all duration-300 ease-out group-data-[collapsible=icon]:px-1.25! [&>svg]:size-auto"
                            tooltip={item.title}
                            isActive={isActive}
                        >
                            <Link
                                href={item.url}
                                className="flex items-center gap-3"
                                // Every dashboard page is dynamic and reads
                                // Postgres; prefetching the whole sidebar
                                // turned one visit into a dozen renders.
                                prefetch={false}
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
        </>
    )
}

/** One labelled sidebar group holding a flat list of links. */
export function NavSectionGroup({
    section,
    pathname
}: {
    section: NavSection
    pathname: string
}) {
    return (
        <SidebarGroup>
            <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    <NavItems items={section.items} pathname={pathname} />
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}

/**
 * A collapsible history entry (a past season or tournament) whose sub-links
 * are one per category, each at `${basePath}/${id}`.
 */
function HistoryNavMenuItem({
    id,
    label,
    icon: Icon,
    groupClass,
    openRotateClass,
    categories,
    pathname
}: {
    id: number
    label: string
    icon: typeof RiCalendarLine
    groupClass: string
    openRotateClass: string
    categories: { key: string; label: string; basePath: string }[]
    pathname: string
}) {
    return (
        <Collapsible asChild className={groupClass}>
            <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                        className="group/menu-button h-9 gap-3 font-medium transition-all duration-300 ease-out group-data-[collapsible=icon]:px-1.25! [&>svg]:size-auto"
                        tooltip={label}
                    >
                        <Icon
                            className="text-muted-foreground/65"
                            size={22}
                            aria-hidden="true"
                        />
                        <span>{label}</span>
                        <RiArrowDownSLine
                            className={`ml-auto transition-transform duration-200 ${openRotateClass}`}
                            size={16}
                        />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {categories.map((cat) => {
                            const href = `${cat.basePath}/${id}`
                            return (
                                <SidebarMenuSubItem key={cat.key}>
                                    <SidebarMenuSubButton
                                        asChild
                                        isActive={pathname.startsWith(href)}
                                    >
                                        <Link href={href} prefetch={false}>
                                            <span>{cat.label}</span>
                                        </Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            )
                        })}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </SidebarMenuItem>
        </Collapsible>
    )
}

function SeasonNavMenuItem({
    season,
    pathname
}: {
    season: SeasonNavItem
    pathname: string
}) {
    return (
        <HistoryNavMenuItem
            id={season.id}
            label={formatSeasonRowLabel(season)}
            icon={RiCalendarLine}
            groupClass="group/season"
            openRotateClass="group-data-[state=open]/season:rotate-180"
            categories={seasonCategories}
            pathname={pathname}
        />
    )
}

function TournamentNavMenuItem({
    tournament,
    pathname
}: {
    tournament: TournamentNavItem
    pathname: string
}) {
    return (
        <HistoryNavMenuItem
            id={tournament.id}
            label={`${tournament.name} (${tournament.year})`}
            icon={RiMedalLine}
            groupClass="group/tournament"
            openRotateClass="group-data-[state=open]/tournament:rotate-180"
            categories={tournamentCategories}
            pathname={pathname}
        />
    )
}

/** Hall of Champions, every past season/tournament, then All Seasons. */
export function HistoricalNavGroup({
    historicalNav,
    pathname
}: {
    historicalNav: SidebarData["historicalNav"]
    pathname: string
}) {
    return (
        <SidebarGroup>
            <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                Historical
            </SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    <NavItems
                        items={[hallOfChampionsNavItem]}
                        pathname={pathname}
                    />
                    {historicalNav.map((entry) =>
                        entry.kind === "season" ? (
                            <SeasonNavMenuItem
                                key={`season-${entry.season.id}`}
                                season={entry.season}
                                pathname={pathname}
                            />
                        ) : (
                            <TournamentNavMenuItem
                                key={`tournament-${entry.tournament.id}`}
                                tournament={entry.tournament}
                                pathname={pathname}
                            />
                        )
                    )}
                    <NavItems
                        items={[seasonHistoryNavItem]}
                        pathname={pathname}
                    />
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}

/** Admin-only collapsed listing of every page the sidebar currently hides. */
export function HiddenPagesGroup({
    groups,
    pathname
}: {
    groups: NavSection[]
    pathname: string
}) {
    return (
        <Collapsible defaultOpen={false} className="group/hidden-pages">
            <SidebarGroup>
                <SidebarGroupLabel
                    asChild
                    className="cursor-pointer text-muted-foreground/65 uppercase hover:text-foreground"
                >
                    <CollapsibleTrigger className="flex w-full items-center">
                        All Hidden Pages
                        <RiArrowDownSLine
                            className="ml-auto transition-transform duration-200 group-data-[state=open]/hidden-pages:rotate-180"
                            size={16}
                        />
                    </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                    <SidebarGroupContent>
                        {groups.map((group) => (
                            <div key={group.label}>
                                <p className="px-2 pt-2 pb-1 text-muted-foreground/50 text-sm">
                                    {group.label}
                                </p>
                                <SidebarMenu>
                                    <NavItems
                                        items={group.items}
                                        pathname={pathname}
                                    />
                                </SidebarMenu>
                            </div>
                        ))}
                    </SidebarGroupContent>
                </CollapsibleContent>
            </SidebarGroup>
        </Collapsible>
    )
}
