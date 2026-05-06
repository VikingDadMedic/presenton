"use client";

import React from "react";
import { LayoutDashboard, Star, Brain, Settings, Palette, HelpCircle, Megaphone, History } from "lucide-react";
import { MotionIcon } from "motion-icons-react";
import { usePathname } from "next/navigation";
import Link from "next/link";



export const defaultNavItems = [
    { key: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { key: "campaign" as const, label: "Campaigns", icon: Megaphone },
    { key: "past-trips" as const, label: "Past trips", icon: History },
    { key: "templates" as const, label: "Standard", icon: Star },
    { key: "designs" as const, label: "Smart", icon: Brain },



];
export const BelongingNavItems = [
    { key: "settings" as const, label: "Settings", icon: Settings },
]

const DashboardSidebar = () => {


    const pathname = usePathname();
    const activeTab = pathname.split("?")[0].split("/").pop();





    return (
        <aside
            className="sticky top-0 h-screen w-[115px] flex flex-col justify-between bg-muted backdrop-blur border-r border-border px-4  py-8"
            aria-label="Dashboard sidebar"
        >
            <div>

                <Link href={`/dashboard`} className="flex items-center  pb-6 border-b border-border   gap-2    ">
                    <div className="bg-primary rounded-lg cursor-pointer p-1 flex justify-center items-center mx-auto">
                        <img src="/logo-with-bg.png" alt="TripStory logo" className="h-[40px] object-contain w-full" />
                    </div>
                </Link>
                <nav className="pt-6 font-syne" aria-label="Dashboard sections">
                    <div className="  space-y-6">

                        {/* Dashboard */}
                        <Link
                            prefetch={false}
                            href={`/dashboard`}
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors",
                                pathname === "/dashboard" ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label="Dashboard"
                            title="Dashboard"
                        >
                            <MotionIcon name="LayoutDashboard" animation="bounce" trigger="hover" size={16} className={pathname === "/dashboard" ? "text-primary" : "text-muted-foreground"} />
                            <span className="text-[11px] text-foreground">Dashboard</span>
                        </Link>
                        <Link
                            prefetch={false}
                            href={`/templates`}
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors",
                                pathname === "/templates" ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label="Head Starts"
                            title="Head Starts"
                        >
                            <div className="flex flex-col cursor-pointer tex-center items-center gap-2  transition-colors">
                                <MotionIcon name="Bookmark" animation="bounce" trigger="hover" size={16} className={pathname === "/templates" ? "text-primary" : "text-muted-foreground"} />
                                <span className="text-[11px] text-foreground">Head Starts</span>
                            </div>
                        </Link>
                        <Link
                            prefetch={false}
                            href={`/campaign`}
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors",
                                pathname === "/campaign" ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label="Campaigns"
                            title="Campaigns"
                        >
                            <div className="flex flex-col cursor-pointer tex-center items-center gap-2  transition-colors">
                                <MotionIcon name="Megaphone" animation="bounce" trigger="hover" size={16} className={pathname === "/campaign" ? "text-primary" : "text-muted-foreground"} />
                                <span className="text-[11px] text-foreground">Campaigns</span>
                            </div>
                        </Link>
                        <Link
                            prefetch={false}
                            href={`/past-trips`}
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors",
                                pathname === "/past-trips" ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label="Past trips"
                            title="Past trips"
                        >
                            <div className="flex flex-col cursor-pointer tex-center items-center gap-2  transition-colors">
                                <MotionIcon name="History" animation="bounce" trigger="hover" size={16} className={pathname === "/past-trips" ? "text-primary" : "text-muted-foreground"} />
                                <span className="text-[11px] text-foreground">Past trips</span>
                            </div>
                        </Link>
                        <Link
                            prefetch={false}
                            href={`/theme`}
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors",
                                pathname === "/theme" ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label="Theme"
                            title="Theme"
                        >
                            <div className="flex flex-col cursor-pointer tex-center items-center gap-2  transition-colors">
                                <MotionIcon name="Palette" animation="bounce" trigger="hover" size={16} className={pathname === "/theme" ? "text-primary" : "text-muted-foreground"} />
                                <span className="text-[11px] text-foreground">Themes</span>
                            </div>
                        </Link>
                    </div>
                </nav>
            </div>

            {/* Settings link hidden for TripStory */}
        </aside>
    );
};

export default DashboardSidebar;


