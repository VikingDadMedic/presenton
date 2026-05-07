"use client";

import React from "react";
import { LayoutDashboard, Star, Brain, Settings, Palette, HelpCircle, Megaphone, History, Bookmark } from "lucide-react";
import { MotionIcon } from "motion-icons-react";
import { usePathname } from "next/navigation";
import Link from "next/link";

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@/components/ui/sidebar";

export const defaultNavItems = [
    { key: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", motionIcon: "LayoutDashboard" },
    { key: "templates" as const, label: "Head Starts", icon: Bookmark, href: "/templates", motionIcon: "Bookmark" },
    { key: "campaign" as const, label: "Campaigns", icon: Megaphone, href: "/campaign", motionIcon: "Megaphone" },
    { key: "past-trips" as const, label: "Past trips", icon: History, href: "/past-trips", motionIcon: "History" },
    { key: "theme" as const, label: "Themes", icon: Palette, href: "/theme", motionIcon: "Palette" },
];

export const BelongingNavItems = [
    { key: "settings" as const, label: "Settings", icon: Settings },
];

const DashboardSidebar = () => {
    const pathname = usePathname();

    return (
        <Sidebar collapsible="icon" variant="sidebar" aria-label="Dashboard sidebar">
            <SidebarHeader className="px-2 pt-3 pb-1">
                <Link href="/dashboard" className="flex items-center justify-center">
                    <div className="bg-primary rounded-lg cursor-pointer p-1 flex justify-center items-center w-full max-w-[44px] aspect-square">
                        <img
                            src="/logo-with-bg.png"
                            alt="TripStory logo"
                            className="h-7 w-7 object-contain"
                        />
                    </div>
                </Link>
            </SidebarHeader>
            <SidebarContent className="font-display">
                <SidebarMenu className="px-2 pt-2">
                    {defaultNavItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <SidebarMenuItem key={item.key}>
                                <SidebarMenuButton
                                    asChild
                                    isActive={isActive}
                                    tooltip={item.label}
                                    aria-label={item.label}
                                >
                                    <Link href={item.href} prefetch={false}>
                                        <MotionIcon
                                            name={item.motionIcon}
                                            animation="bounce"
                                            trigger="hover"
                                            size={16}
                                            className={isActive ? "text-primary" : "text-muted-foreground"}
                                        />
                                        <span className="text-[13px] text-foreground">{item.label}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    })}
                </SidebarMenu>
            </SidebarContent>
            <SidebarFooter className="px-2 pb-3">
                {/* Settings link hidden for TripStory; reserved slot for future per-AGENTS.md */}
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
};

export default DashboardSidebar;
