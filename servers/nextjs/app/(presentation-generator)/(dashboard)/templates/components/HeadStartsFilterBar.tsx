"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const ASPECT_OPTIONS = ["all", "landscape", "vertical", "square"] as const;
export type AspectOption = (typeof ASPECT_OPTIONS)[number];

export const SORT_OPTIONS = [
    { value: "recent", label: "Recently used" },
    { value: "popular", label: "Most popular" },
    { value: "az", label: "A-Z" },
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export const ASPECT_LABELS: Record<Exclude<AspectOption, "all">, string> = {
    landscape: "Landscape",
    vertical: "Vertical",
    square: "Square",
};

const SEARCH_DEBOUNCE_MS = 250;

interface HeadStartsFilterBarProps {
    availableUseCases: string[];
}

export function HeadStartsFilterBar({ availableUseCases }: HeadStartsFilterBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const urlQ = searchParams?.get("q") ?? "";
    const urlUseCase = searchParams?.get("useCase") ?? "";
    const urlAspect = (searchParams?.get("aspect") ?? "all") as AspectOption;
    const urlSort = searchParams?.get("sort") ?? "";

    const selectedUseCases = useMemo(
        () => urlUseCase.split(",").map((v) => v.trim()).filter(Boolean),
        [urlUseCase],
    );

    const [searchInput, setSearchInput] = useState(urlQ);

    useEffect(() => {
        setSearchInput(urlQ);
    }, [urlQ]);

    const updateParams = useCallback(
        (updates: Record<string, string | null>) => {
            const next = new URLSearchParams(searchParams?.toString() ?? "");
            for (const [key, value] of Object.entries(updates)) {
                if (value === null || value === "") next.delete(key);
                else next.set(key, value);
            }
            const queryString = next.toString();
            router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, {
                scroll: false,
            });
        },
        [pathname, router, searchParams],
    );

    useEffect(() => {
        if (searchInput === urlQ) return;
        const handle = window.setTimeout(() => {
            updateParams({ q: searchInput });
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(handle);
    }, [searchInput, urlQ, updateParams]);

    const clearSearch = useCallback(() => {
        setSearchInput("");
        updateParams({ q: null });
    }, [updateParams]);

    const toggleUseCase = useCallback(
        (label: string) => {
            const current = new Set(selectedUseCases);
            if (current.has(label)) current.delete(label);
            else current.add(label);
            const next = Array.from(current);
            updateParams({ useCase: next.length ? next.join(",") : null });
        },
        [selectedUseCases, updateParams],
    );

    const clearUseCases = useCallback(() => {
        updateParams({ useCase: null });
    }, [updateParams]);

    const setAspect = useCallback(
        (value: AspectOption) => {
            updateParams({ aspect: value === "all" ? null : value });
        },
        [updateParams],
    );

    const setSort = useCallback(
        (value: SortOption | "") => {
            updateParams({ sort: value === "" ? null : value });
        },
        [updateParams],
    );

    const isAllUseCases = selectedUseCases.length === 0;

    return (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        placeholder="Search head starts…"
                        aria-label="Search head starts"
                        className="h-9 pl-9 pr-9"
                    />
                    {searchInput ? (
                        <button
                            type="button"
                            onClick={clearSearch}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    ) : null}
                </div>

                <div className="flex items-center gap-1.5">
                    {(ASPECT_OPTIONS as readonly AspectOption[]).map((option) => {
                        const isActive = urlAspect === option;
                        const label = option === "all" ? "All sizes" : ASPECT_LABELS[option];
                        return (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setAspect(option)}
                                aria-pressed={isActive}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                    isActive
                                        ? "border-primary/50 bg-primary/10 text-primary"
                                        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                                )}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Sort:
                    <select
                        value={urlSort}
                        onChange={(event) => setSort(event.target.value as SortOption | "")}
                        className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        aria-label="Sort head starts"
                    >
                        <option value="">Default order</option>
                        {SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {availableUseCases.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={clearUseCases}
                        aria-pressed={isAllUseCases}
                        className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            isAllUseCases
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                    >
                        All
                    </button>
                    {availableUseCases.map((label) => {
                        const isActive = selectedUseCases.includes(label);
                        return (
                            <button
                                key={label}
                                type="button"
                                onClick={() => toggleUseCase(label)}
                                aria-pressed={isActive}
                                className={cn(
                                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                    isActive
                                        ? "border-primary/50 bg-primary/10 text-primary"
                                        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                                )}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

export interface HeadStartsFilters {
    q: string;
    useCases: string[];
    aspect: AspectOption;
    sort: SortOption | null;
}

interface SearchParamsLike {
    get(name: string): string | null;
}

export function readHeadStartsFiltersFromParams(
    searchParams: SearchParamsLike | null,
): HeadStartsFilters {
    const q = (searchParams?.get("q") ?? "").trim();
    const useCases = (searchParams?.get("useCase") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const aspectRaw = (searchParams?.get("aspect") ?? "all").toLowerCase() as AspectOption;
    const aspect = (ASPECT_OPTIONS as readonly string[]).includes(aspectRaw) ? aspectRaw : "all";
    const sortRaw = (searchParams?.get("sort") ?? "") as SortOption | "";
    const validSorts = SORT_OPTIONS.map((option) => option.value);
    const sort = (validSorts as readonly string[]).includes(sortRaw) ? (sortRaw as SortOption) : null;
    return { q, useCases, aspect, sort };
}

export function hasActiveFilters(filters: HeadStartsFilters): boolean {
    return (
        filters.q.length > 0 ||
        filters.useCases.length > 0 ||
        filters.aspect !== "all" ||
        filters.sort !== null
    );
}
