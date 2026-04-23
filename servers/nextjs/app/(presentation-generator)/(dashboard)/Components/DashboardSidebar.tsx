"use client";

import React from "react";
import { LayoutDashboard, Star, Brain, Settings, Palette, HelpCircle, Plane } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { IMAGE_PROVIDERS, LLM_PROVIDERS } from "@/utils/providerConstants";



export const defaultNavItems = [
    { key: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { key: "templates" as const, label: "Standard", icon: Star },
    { key: "designs" as const, label: "Smart", icon: Brain },



];
export const BelongingNavItems = [
    { key: "settings" as const, label: "Settings", icon: Settings },
]

const DashboardSidebar = () => {


    const pathname = usePathname();
    const searchParams = useSearchParams();
    const activeTab = pathname.split("?")[0].split("/").pop();
    const isTravelActive = pathname === "/upload" && searchParams.get("type") === "travel";
    const router = useRouter();

    const { llm_config } = useSelector((state: RootState) => state.userConfig)





    return (
        <aside
            className="sticky top-0 h-screen w-[115px] flex flex-col justify-between bg-[#F6F6F9] backdrop-blur border-r border-[#E1E1E5] px-4  py-8"
            aria-label="Dashboard sidebar"
        >
            <div>

                <Link href={`/dashboard`} className="flex items-center  pb-6 border-b border-[#E1E1E5]   gap-2    ">
                    <div className="bg-primary rounded-lg cursor-pointer p-1 flex justify-center items-center mx-auto">
                        <img src="/logo-with-bg.png" alt="TripStory logo" className="h-[40px] object-contain w-full" />
                    </div>
                </Link>
                <nav className="pt-6 font-display" aria-label="Dashboard sections">
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
                            <LayoutDashboard className={["h-4 w-4", pathname === "/dashboard" ? "text-primary" : "text-slate-600"].join(" ")} />
                            <span className="text-[11px] text-slate-800">Dashboard</span>
                        </Link>
                        <Link
                            prefetch={false}
                            href={`/templates`}
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors",
                                pathname === "/templates" ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label="Templates"
                            title="Templates"
                        >
                            <div className="flex flex-col cursor-pointer tex-center items-center gap-2  transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={`${pathname === "/templates" ? "var(--primary)" : "#475569"}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M4 14h6" /><path d="M4 2h10" /><rect x="4" y="18" width="16" height="4" rx="1" /><rect x="4" y="6" width="16" height="4" rx="1" /></svg>
                                <span className="text-[11px] text-slate-800">Templates</span>
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
                                <Palette className={`h-4 w-4 ${pathname === "/theme" ? "text-primary" : "text-slate-600"}`} />
                                <span className="text-[11px] text-slate-800">Themes</span>
                            </div>
                        </Link>
                        <Link
                            prefetch={false}
                            href="/upload?type=travel"
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors",
                                isTravelActive ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label="Travel"
                            title="Travel"
                        >
                            <div className="flex flex-col cursor-pointer tex-center items-center gap-2  transition-colors">
                                <Plane className={`h-4 w-4 ${isTravelActive ? "text-primary" : "text-slate-600"}`} />
                                <span className="text-[11px] text-slate-800">Travel</span>
                            </div>
                        </Link>
                    </div>
                </nav>
            </div>

            <div className=" pt-5 border-t border-[#E1E1E5]  font-display "
            >
                {/* Help and Community links hidden for TripStory */}


                {BelongingNavItems.map(({ key, label: itemLabel, icon: Icon }) => {
                    const isActive = activeTab === key;
                    return (
                        <Link
                            prefetch={false}
                            key={key}
                            href={`/${key}`}
                            className={[
                                "flex flex-col tex-center items-center gap-2  transition-colors ",
                                isActive ? "" : "ring-transparent",
                            ].join(" ")}
                            aria-label={itemLabel}
                            title={itemLabel}
                        >
                            {/* <div className="flex items-center  ">
                                <img src={imageProviderIcon} alt="image provider" className="w-5 h-5 rounded-full object-cover border border-[#EDEEEF]" />
                                <img src={textProviderIcon} alt="text provider" className="w-5 h-5 rounded-full object-cover border border-[#EDEEEF]" />
                            </div> */}
                            <Settings className={`h-4 w-4 ${isActive ? "text-primary" : "text-slate-600"}`} />
                            <span className="text-[11px] text-slate-800">{itemLabel}</span>
                        </Link>
                    );
                })}



            </div>

        </aside>
    );
};

export default DashboardSidebar;


