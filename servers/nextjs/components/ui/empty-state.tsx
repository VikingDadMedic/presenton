"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    cta?: {
        label: string;
        href?: string;
        onClick?: () => void;
    };
    className?: string;
    children?: React.ReactNode;
}

export function EmptyState({
    icon,
    title,
    description,
    cta,
    className,
    children,
}: EmptyStateProps) {
    return (
        <Card
            className={cn(
                "flex flex-col items-center justify-center gap-4 border-2 border-dashed bg-card/40 p-10 text-center shadow-none",
                className,
            )}
        >
            {icon ? (
                <div
                    className="flex h-12 w-12 items-center justify-center text-primary"
                    aria-hidden="true"
                >
                    {icon}
                </div>
            ) : null}
            <div className="space-y-1.5">
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                {description ? (
                    <p className="mx-auto max-w-md text-sm text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {cta ? (
                cta.href ? (
                    <Button asChild>
                        <Link href={cta.href} onClick={cta.onClick}>
                            {cta.label}
                        </Link>
                    </Button>
                ) : (
                    <Button onClick={cta.onClick}>{cta.label}</Button>
                )
            ) : null}
            {children}
        </Card>
    );
}
