"use client";

import { LayoutDashboard, Palette, Megaphone, History, Bookmark } from "lucide-react";
import { MotionIcon } from "motion-icons-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export const defaultNavItems = [
    { key: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", motionIcon: "LayoutDashboard" },
    { key: "templates" as const, label: "Head Starts", icon: Bookmark, href: "/templates", motionIcon: "Bookmark" },
    { key: "campaign" as const, label: "Campaigns", icon: Megaphone, href: "/campaign", motionIcon: "Megaphone" },
    { key: "past-trips" as const, label: "Past trips", icon: History, href: "/past-trips", motionIcon: "History" },
    { key: "theme" as const, label: "Themes", icon: Palette, href: "/theme", motionIcon: "Palette" },
];

const DashboardSidebar = () => {
    const pathname = usePathname();

    return (
        <Sidebar collapsible="icon" variant="sidebar" aria-label="Dashboard sidebar">
            <SidebarHeader className="px-2 pt-3 pb-1">
                <Link href="/dashboard" className="flex items-center justify-center px-2">
                    <Image
                        src="/logo-light.svg"
                        alt="TripStory"
                        width={108}
                        height={28}
                        className="h-7 w-auto cursor-pointer object-contain"
                    />
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
                <div className="flex justify-center">
                    <ThemeSwitcher compact />
                </div>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
};

export default DashboardSidebar;
