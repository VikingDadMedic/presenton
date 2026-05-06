"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface DashboardPageHeaderProps {
    icon?: React.ReactNode;
    title: string;
    action?: React.ReactNode;
    className?: string;
}

/**
 * Shared sticky page header for Head Starts / Campaigns / Past trips
 * dashboard pages. Replaces the duplicated `<div className="sticky top-0
 * right-0 z-50 py-[28px] backdrop-blur mb-4">…</div>` pattern.
 */
export function DashboardPageHeader({
    icon,
    title,
    action,
    className,
}: DashboardPageHeaderProps) {
    return (
        <div
            className={cn(
                "sticky top-0 right-0 z-50 mb-4 py-[28px] backdrop-blur",
                className,
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h3 className="flex items-center gap-2 font-display text-[28px] font-normal tracking-[-0.84px] text-foreground">
                    {icon}
                    {title}
                </h3>
                {action ? (
                    <div className="flex items-center gap-2.5 max-sm:w-full max-md:justify-center max-sm:flex-wrap">
                        {action}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
