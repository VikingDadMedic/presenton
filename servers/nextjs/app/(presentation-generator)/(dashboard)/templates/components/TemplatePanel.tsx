"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { MotionIcon } from "motion-icons-react";
import { AnimatedLoader } from "@/components/ui/animated-loader";
import { templates } from "@/app/presentation-templates";
import { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
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
    CustomTemplatePreview,
} from "../../../components/TemplatePreviewComponents";

export const CustomTemplateCard = React.memo(function CustomTemplateCard({ template }: { template: CustomTemplates }) {
    const router = useRouter();
    const { previewLayouts, loading } = useCustomTemplatePreview(`${template.id}`);
    const handleOpen = useCallback(() => {
        trackEvent(MixpanelEvent.Templates_Custom_Opened, { template_id: template.id, template_name: template.name });
        if (template.id.startsWith('custom-')) {
            router.push(`/template-preview?slug=${template.id}`)
        } else {
            router.push(`/template-preview?slug=custom-${template.id}`)
        }
    }, [router, template.id, template.name]);

    return (
        <Card
            className="cursor-pointer flex flex-col shadow-none sm:shadow-none relative hover:-translate-y-1 hover:shadow-lg transition-all duration-200 group overflow-hidden rounded-[22px] border border-[#E8E9EC] bg-card"
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
}: {
    template: TemplateLayoutsWithSettings;
    onOpen: (id: string) => void;
}) {
    const handleOpen = useCallback(() => onOpen(template.id), [onOpen, template.id]);

    return (
        <Card
            key={template.id}
            className="group relative cursor-pointer overflow-hidden rounded-[22px] border border-[#E8E9EC] bg-card shadow-none sm:shadow-none transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
            onClick={handleOpen}
        >
            <TemplatePreviewStage>
                <UseCaseBadge templateId={template.id} />
                <InbuiltTemplatePreview layouts={template.layouts} templateId={template.id} />
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
    const { templates: customTemplates, loading: customLoading } = useCustomTemplateSummaries();

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
        trackEvent(MixpanelEvent.Templates_Inbuilt_Opened, { template_id: id });
        router.push(`/template-preview?slug=${id}`);
    }, [router]);

    const HIDDEN_TEMPLATE_IDS = new Set(["code", "education", "product-overview"]);

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
            <div className="sticky top-0 right-0 z-50 py-[28px] px-6   backdrop-blur ">
                <div className="flex xl:flex-row flex-col gap-6 xl:gap-0 items-center justify-between">
                    <h3 className=" text-[28px] tracking-[-0.84px] font-display font-normal text-[#101828] flex items-center gap-2">
                        <MotionIcon name="Bookmark" animation="bounce" trigger="hover" size={24} className="text-primary" />
                        Head Starts
                    </h3>
                    <div className="flex  gap-2.5 max-sm:w-full max-md:justify-center max-sm:flex-wrap">
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

                    </div>
                </div>
            </div>

            <div className="l mx-auto px-6 py-8">
                <div className='p-1 rounded-[40px] bg-[#ffffff] w-fit border border-border flex items-center justify-center '>
                    <button className='px-5  py-2 text-xs font-medium text-[#3A3A3A] rounded-[70px]'
                        onClick={() => { trackEvent(MixpanelEvent.Templates_Tab_Switched, { tab: 'custom' }); setTab('custom'); }}
                        style={{
                            background: tab === 'custom' ? 'var(--primary-5, rgba(154,106,26,0.05))' : 'transparent',
                            color: tab === 'custom' ? 'var(--primary)' : '#3A3A3A'
                        }}
                    >Custom</button>
                    <svg xmlns="http://www.w3.org/2000/svg" className='mx-1' width="2" height="17" viewBox="0 0 2 17" fill="none">
                        <path d="M1 0V16.5" stroke="#EDECEC" strokeWidth="2" />
                    </svg>
                    <button className='px-5  py-2 text-xs font-medium text-[#3A3A3A] rounded-[70px]'
                        onClick={() => { trackEvent(MixpanelEvent.Templates_Tab_Switched, { tab: 'default' }); setTab('default'); }}
                        style={{
                            background: tab === 'default' ? 'var(--primary-5, rgba(154,106,26,0.05))' : 'transparent',
                            color: tab === 'default' ? 'var(--primary)' : '#3A3A3A'
                        }}
                    >Built-in</button>
                </div>

                {/* Inbuilt Templates Section: non-neo first, then Report (neo) */}
                {tab === 'default' && (
                    <section className="my-12 space-y-12">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {nonNeoInbuilt.map((template) => (
                                <InbuiltTemplateCard
                                    key={template.id}
                                    template={template}
                                    onOpen={handleOpenPreview}
                                />
                            ))}
                        </div>
                        {neoInbuilt.length > 0 && (
                            <div>
                                <h4 className="text-base font-semibold text-[#101828] mb-6 font-display tracking-tight">
                                    Report
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {neoInbuilt.map((template) => (
                                        <InbuiltTemplateCard
                                            key={template.id}
                                            template={template}
                                            onOpen={handleOpenPreview}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                )}


                {tab === 'custom' && <section className="my-12">
                    {customLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <AnimatedLoader size={32} className="text-primary" />
                            <span className="ml-3 text-muted-foreground">Loading custom templates...</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 items-center lg:grid-cols-4 gap-6">
                            <CreateCustomTemplate />
                            {customTemplateCards}
                        </div>
                    )}
                </section>}
            </div>
        </div>
    );
};

export default LayoutPreview;
