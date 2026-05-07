"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { MotionIcon } from "motion-icons-react";
import { AnimatedLoader } from "@/components/ui/animated-loader";
import { DashboardPageHeader } from "@/components/ui/dashboard-page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { templates } from "@/app/presentation-templates";
import { HIDDEN_TEMPLATE_IDS, TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import { getUseCaseLabel } from "@/app/presentation-templates/use-case-taxonomy";
import {
    useCustomTemplateSummaries,
    useCustomTemplatePreview,
    CustomTemplates,
} from "@/app/hooks/useCustomTemplates";
import CreateCustomTemplate from "./CreateCustomTemplate";
import Link from "next/link";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import {
    TemplatePreviewStage,
    UseCaseBadge,
    InbuiltTemplatePreview,
    ScaledSlidePreview,
    CustomTemplatePreview,
} from "../../../components/TemplatePreviewComponents";
import {
    HeadStartsFilterBar,
} from "./HeadStartsFilterBar";
import { recordHeadStartUse, readRecents, readUseCounts } from "./headStartsHistory";
import {
    applyHeadStartFilters,
    hasActiveFilters,
    readHeadStartsFiltersFromParams,
} from "@/lib/head-starts-filters";

const HOVER_PREVIEW_DELAY_MS = 800;

function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(mql.matches);
        update();
        if (typeof mql.addEventListener === "function") {
            mql.addEventListener("change", update);
            return () => mql.removeEventListener("change", update);
        }
        // Safari < 14 fallback
        mql.addListener(update);
        return () => mql.removeListener(update);
    }, []);
    return reduced;
}

export const CustomTemplateCard = React.memo(function CustomTemplateCard({ template }: { template: CustomTemplates }) {
    const router = useRouter();
    const { previewLayouts, loading } = useCustomTemplatePreview(`${template.id}`);
    const handleOpen = useCallback(() => {
        const trackedId = template.id.startsWith("custom-")
            ? template.id
            : `custom-${template.id}`;
        recordHeadStartUse(trackedId);
        trackEvent(MixpanelEvent.Templates_Custom_Opened, { template_id: template.id, template_name: template.name });
        if (template.id.startsWith('custom-')) {
            router.push(`/template-preview?slug=${template.id}`)
        } else {
            router.push(`/template-preview?slug=custom-${template.id}`)
        }
    }, [router, template.id, template.name]);

    return (
        <Card
            className="cursor-pointer flex flex-col shadow-none sm:shadow-none relative hover:-translate-y-1 hover:shadow-lg transition-all duration-200 group overflow-hidden rounded-[22px] border border-border bg-card"
            onClick={handleOpen}
        >
            <TemplatePreviewStage>
                <UseCaseBadge templateId={`custom-${template.id}`} />
                <CustomTemplatePreview
                    previewLayouts={previewLayouts}
                    loading={loading}
                    templateId={template.id}
                />
            </TemplatePreviewStage>
            <div className="relative z-40 flex items-center justify-between border-t border-border bg-card px-6 py-5">
                <h3 className="max-w-[min(191px,65%)] text-base font-bold text-foreground">{template.name}</h3>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
        </Card>
    );
}, (prev, next) => {
    return (
        prev.template.id === next.template.id &&
        prev.template.name === next.template.name &&
        prev.template.layoutCount === next.template.layoutCount
    );
});

const InbuiltTemplateCard = React.memo(function InbuiltTemplateCard({
    template,
    onOpen,
    enableHoverPreview,
}: {
    template: TemplateLayoutsWithSettings;
    onOpen: (id: string) => void;
    enableHoverPreview: boolean;
}) {
    const handleOpen = useCallback(() => onOpen(template.id), [onOpen, template.id]);
    const [showHoverPreview, setShowHoverPreview] = useState(false);
    const hoverTimerRef = useRef<number | null>(null);

    const hasThirdSlide = template.layouts.length >= 3;
    const thirdLayout = hasThirdSlide ? template.layouts[2] : null;
    const ThirdLayoutComponent = thirdLayout?.component ?? null;

    const handleMouseEnter = useCallback(() => {
        if (!enableHoverPreview || !hasThirdSlide) return;
        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = window.setTimeout(() => {
            setShowHoverPreview(true);
        }, HOVER_PREVIEW_DELAY_MS);
    }, [enableHoverPreview, hasThirdSlide]);

    const handleMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        setShowHoverPreview(false);
    }, []);

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
        };
    }, []);

    return (
        <Card
            key={template.id}
            className="group relative cursor-pointer overflow-hidden rounded-[22px] border border-border bg-card shadow-none sm:shadow-none transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
            onClick={handleOpen}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <TemplatePreviewStage>
                <UseCaseBadge templateId={template.id} />
                <InbuiltTemplatePreview layouts={template.layouts} templateId={template.id} />
                {ThirdLayoutComponent && thirdLayout ? (
                    <div
                        className={`pointer-events-none absolute inset-x-5 bottom-5 z-20 motion-safe:transition-opacity motion-safe:duration-200 ${showHoverPreview ? "opacity-100" : "opacity-0"
                            }`}
                        aria-hidden="true"
                    >
                        <ScaledSlidePreview id={`${template.id}-hover`} index={2}>
                            <ThirdLayoutComponent data={thirdLayout.sampleData} />
                        </ScaledSlidePreview>
                    </div>
                ) : null}
            </TemplatePreviewStage>
            <div className="relative z-40 flex items-center justify-between gap-4 border-t border-border bg-card px-6 py-5">
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold capitalize text-foreground">{template.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{template.description}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
        </Card>
    );
});

const LayoutPreview = () => {
    const [tab, setTab] = useState<'custom' | 'default'>('default');
    const router = useRouter();
    const searchParams = useSearchParams();
    const reducedMotion = usePrefersReducedMotion();
    const { templates: customTemplates, loading: customLoading } = useCustomTemplateSummaries();

    const [historyVersion, setHistoryVersion] = useState(0);

    useEffect(() => {
        trackEvent(MixpanelEvent.Templates_Page_Viewed);
        const existingScript = document.querySelector('script[src*="tailwindcss.com"]');
        if (!existingScript) {
            const script = document.createElement("script");
            script.src = "https://cdn.tailwindcss.com";
            script.async = true;
            document.head.appendChild(script);
        }
    }, []);

    const handleOpenPreview = useCallback((id: string) => {
        recordHeadStartUse(id);
        setHistoryVersion((value) => value + 1);
        trackEvent(MixpanelEvent.Templates_Inbuilt_Opened, { template_id: id });
        router.push(`/template-preview?slug=${id}`);
    }, [router]);

    const { nonNeoInbuilt, neoInbuilt } = useMemo(() => {
        const nonNeo: TemplateLayoutsWithSettings[] = [];
        const neo: TemplateLayoutsWithSettings[] = [];
        for (const t of templates) {
            if (HIDDEN_TEMPLATE_IDS.has(t.id)) continue;
            if (t.id.startsWith("neo")) neo.push(t);
            else nonNeo.push(t);
        }
        return { nonNeoInbuilt: nonNeo, neoInbuilt: neo };
    }, []);

    /**
     * Built-in templates grouped by their `settings.category` field
     * (added by the 3.5 data migration). The display order is fixed —
     * Travel first because that's TripStory's primary use case, then
     * Business, then Report. Templates without a category fall into "Other"
     * (defensive — the migration filled all 24, but new contributors may
     * forget the field on a fresh template).
     */
    const visibleInbuilt = useMemo(
        () => [...nonNeoInbuilt, ...neoInbuilt],
        [nonNeoInbuilt, neoInbuilt],
    );

    const CATEGORY_DISPLAY_ORDER = ["Travel", "Business", "Report"] as const;

    const availableUseCases = useMemo(() => {
        const seen = new Set<string>();
        const order: string[] = [];
        for (const template of [...nonNeoInbuilt, ...neoInbuilt]) {
            const label = getUseCaseLabel(template.id);
            if (!seen.has(label)) {
                seen.add(label);
                order.push(label);
            }
        }
        return order;
    }, [nonNeoInbuilt, neoInbuilt]);

    const filters = useMemo(() => readHeadStartsFiltersFromParams(searchParams), [searchParams]);
    const filtersActive = hasActiveFilters(filters);

    const [historyData, setHistoryData] = useState<{ recents: string[]; counts: Record<string, number> }>({
        recents: [],
        counts: {},
    });

    useEffect(() => {
        setHistoryData({ recents: readRecents(), counts: readUseCounts() });
    }, [historyVersion, filters.sort]);

    const filteredNonNeo = useMemo(
        () =>
            applyHeadStartFilters(
                nonNeoInbuilt,
                filters,
                historyData.recents,
                historyData.counts,
                (template) => getUseCaseLabel(template.id),
            ),
        [nonNeoInbuilt, filters, historyData.recents, historyData.counts],
    );
    const filteredNeo = useMemo(
        () =>
            applyHeadStartFilters(
                neoInbuilt,
                filters,
                historyData.recents,
                historyData.counts,
                (template) => getUseCaseLabel(template.id),
            ),
        [neoInbuilt, filters, historyData.recents, historyData.counts],
    );

    const handleResetFilters = useCallback(() => {
        router.replace(window.location.pathname, { scroll: false });
    }, [router]);

    const customTemplateCards = useMemo(
        () => customTemplates.map((template: CustomTemplates) => <CustomTemplateCard key={template.id} template={template} />),
        [customTemplates],
    );

    return (
        <div className="min-h-screen  relative font-display">
            <div
                className='fixed z-0 -bottom-[16.5rem] left-0 w-full h-full'
                style={{
                    height: "341px",
                    borderRadius: '1440px',
                    background: 'radial-gradient(5.92% 104.69% at 50% 100%, rgba(201, 168, 76, 0.00) 0%, rgba(255, 255, 255, 0.00) 100%), radial-gradient(50% 50% at 50% 50%, rgba(201, 168, 76, 0.80) 0%, rgba(201, 168, 76, 0.00) 100%)',
                }}
            />
            <DashboardPageHeader
                className="px-6"
                icon={<MotionIcon name="Bookmark" animation="bounce" trigger="hover" size={24} className="text-primary" />}
                title="Head Starts"
                action={
                    <Button
                        asChild
                        variant="signal"
                        className="font-display font-semibold"
                        aria-label="Create new head start"
                    >
                        <Link
                            href="/custom-template"
                            onClick={() => trackEvent(MixpanelEvent.Templates_New_Template_Clicked)}
                        >
                            <MotionIcon name="Plus" animation="spin" trigger="hover" size={16} />
                            <span className="hidden md:inline">New Head Start</span>
                            <span className="md:hidden">New</span>
                        </Link>
                    </Button>
                }
            />

            <div className="l mx-auto px-6 py-8">
                <div className='p-1 rounded-[40px] bg-card w-fit border border-border flex items-center justify-center '>
                    <button className='px-5  py-2 text-xs font-medium text-muted-foreground rounded-[70px]'
                        onClick={() => { trackEvent(MixpanelEvent.Templates_Tab_Switched, { tab: 'custom' }); setTab('custom'); }}
                        style={{
                            background: tab === 'custom' ? 'var(--primary-5, rgba(154,106,26,0.05))' : 'transparent',
                            color: tab === 'custom' ? 'var(--primary)' : 'var(--muted-foreground)'
                        }}
                    >Custom</button>
                    <svg xmlns="http://www.w3.org/2000/svg" className='mx-1' width="2" height="17" viewBox="0 0 2 17" fill="none">
                        <path d="M1 0V16.5" stroke="#EDECEC" strokeWidth="2" />
                    </svg>
                    <button className='px-5  py-2 text-xs font-medium text-muted-foreground rounded-[70px]'
                        onClick={() => { trackEvent(MixpanelEvent.Templates_Tab_Switched, { tab: 'default' }); setTab('default'); }}
                        style={{
                            background: tab === 'default' ? 'var(--primary-5, rgba(154,106,26,0.05))' : 'transparent',
                            color: tab === 'default' ? 'var(--primary)' : 'var(--muted-foreground)'
                        }}
                    >Built-in</button>
                </div>

                {tab === 'default' && (
                    <section className="my-12 space-y-12">
                        <HeadStartsFilterBar availableUseCases={availableUseCases} />

                        {filtersActive ? (
                            filteredNonNeo.length + filteredNeo.length === 0 ? (
                                <EmptyState
                                    icon={<MotionIcon name="SearchX" trigger="hover" animation="wiggle" size={48} />}
                                    title="No head starts match these filters."
                                    description="Try widening your search, switching aspect ratio, or clearing a use-case pill."
                                    cta={{ label: "Reset filters", onClick: handleResetFilters }}
                                />
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {[...filteredNonNeo, ...filteredNeo].map((template) => (
                                        <InbuiltTemplateCard
                                            key={template.id}
                                            template={template}
                                            onOpen={handleOpenPreview}
                                            enableHoverPreview={!reducedMotion}
                                        />
                                    ))}
                                </div>
                            )
                        ) : (
                            <>
                                {(() => {
                                    /**
                                     * Bucket every visible inbuilt template by `settings.category`.
                                     * Templates without a category fall into "Other" (kept rendered
                                     * for forward-compatibility).
                                     */
                                    const buckets: Record<string, TemplateLayoutsWithSettings[]> = {};
                                    for (const template of visibleInbuilt) {
                                        const category =
                                            template.settings?.category?.trim() || "Other";
                                        (buckets[category] ||= []).push(template);
                                    }

                                    const orderedCategories: string[] = [
                                        ...CATEGORY_DISPLAY_ORDER.filter(
                                            (category) => buckets[category]?.length,
                                        ),
                                        // Append any unrecognized categories at the end (alphabetical).
                                        ...Object.keys(buckets)
                                            .filter(
                                                (category) =>
                                                    !CATEGORY_DISPLAY_ORDER.includes(
                                                        category as (typeof CATEGORY_DISPLAY_ORDER)[number],
                                                    ),
                                            )
                                            .sort(),
                                    ];

                                    return orderedCategories.map((category) => {
                                        const items = buckets[category] ?? [];
                                        if (!items.length) return null;

                                        if (category === "Travel") {
                                            // v1: Travel is split by `settings.ordered` into the open
                                            // arc (one entry: `travel`) and the ordered narrative arcs.
                                            const orderedArcs = items.filter(
                                                (template) => template.settings.ordered === true,
                                            );
                                            const openArcs = items.filter(
                                                (template) => template.settings.ordered !== true,
                                            );
                                            return (
                                                <div key={category} className="space-y-8">
                                                    <h4 className="text-base font-semibold text-foreground mb-2 font-display tracking-tight">
                                                        Travel
                                                    </h4>
                                                    {openArcs.length > 0 ? (
                                                        <div>
                                                            <h5 className="text-sm font-semibold text-muted-foreground mb-4 font-display tracking-tight">
                                                                Open arcs
                                                            </h5>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                                                {openArcs.map((template) => (
                                                                    <InbuiltTemplateCard
                                                                        key={template.id}
                                                                        template={template}
                                                                        onOpen={handleOpenPreview}
                                                                        enableHoverPreview={!reducedMotion}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                    {orderedArcs.length > 0 ? (
                                                        <div>
                                                            <h5 className="text-sm font-semibold text-muted-foreground mb-4 font-display tracking-tight">
                                                                Ordered narratives
                                                            </h5>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                                                {orderedArcs.map((template) => (
                                                                    <InbuiltTemplateCard
                                                                        key={template.id}
                                                                        template={template}
                                                                        onOpen={handleOpenPreview}
                                                                        enableHoverPreview={!reducedMotion}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={category}>
                                                <h4 className="text-base font-semibold text-foreground mb-6 font-display tracking-tight">
                                                    {category}
                                                </h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                                    {items.map((template) => (
                                                        <InbuiltTemplateCard
                                                            key={template.id}
                                                            template={template}
                                                            onOpen={handleOpenPreview}
                                                            enableHoverPreview={!reducedMotion}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                                {/* Legacy fallback: render the original "Report" group if (somehow)
                                    no template carries a `category` (e.g. a pre-migration build).
                                    Hidden in normal operation because the 3.5 migration filled all
                                    24 settings.json files. */}
                                {visibleInbuilt.every(
                                    (template) => !template.settings?.category,
                                ) && neoInbuilt.length > 0 ? (
                                    <div>
                                        <h4 className="text-base font-semibold text-foreground mb-6 font-display tracking-tight">
                                            Report
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                            {neoInbuilt.map((template) => (
                                                <InbuiltTemplateCard
                                                    key={template.id}
                                                    template={template}
                                                    onOpen={handleOpenPreview}
                                                    enableHoverPreview={!reducedMotion}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        )}
                    </section>
                )}


                {tab === 'custom' && <section className="my-12 space-y-6">
                    {customLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <AnimatedLoader size={32} className="text-primary" />
                            <span className="ml-3 text-muted-foreground">Loading custom templates...</span>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 items-center lg:grid-cols-4 gap-6">
                                <CreateCustomTemplate />
                                {customTemplateCards}
                            </div>
                            {customTemplates.length === 0 ? (
                                <EmptyState
                                    icon={<MotionIcon name="Sparkles" trigger="hover" animation="pulse" size={48} />}
                                    title="No custom Head Starts yet"
                                    description="Build your first custom Head Start to lock in a layout, palette, and tone you can spin up across campaigns."
                                />
                            ) : null}
                        </>
                    )}
                </section>}
            </div>
        </div>
    );
};

export default LayoutPreview;
