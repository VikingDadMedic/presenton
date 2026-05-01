"use client";

import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import EditableLayoutWrapper from "../components/EditableLayoutWrapper";
import SlideErrorBoundary from "../components/SlideErrorBoundary";
import TiptapTextReplacer from "../components/TiptapTextReplacer";
import { validate as uuidValidate } from 'uuid';
import { getLayoutByLayoutId } from "@/app/presentation-templates";
import { useCustomTemplateDetails } from "@/app/hooks/useCustomTemplates";
import { updateSlideContent } from "@/store/slices/presentationGeneration";
import { useDispatch } from "react-redux";
import { Loader2 } from "lucide-react";
import { getApiUrl } from "@/utils/api";


type AgentProfileView = {
    agent_name?: string | null;
    agency_name?: string | null;
    email?: string | null;
    phone?: string | null;
    booking_url?: string | null;
    tagline?: string | null;
    logo_url?: string | null;
};

type SlideLike = {
    id?: string | null;
    index: number;
    layout?: string | null;
    layout_group?: string | null;
    content?: unknown;
    properties?: Record<string, unknown> | null;
};

let cachedAgentProfile: AgentProfileView | null = null;
let inFlightAgentProfileRequest: Promise<AgentProfileView | null> | null = null;

const normalizeProfileValue = (value: unknown): string | null => {
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim();
    return normalized || null;
};

const readStringField = (value: unknown, key: string): string | null => {
    if (!value || typeof value !== "object") {
        return null;
    }
    const candidate = (value as Record<string, unknown>)[key];
    return normalizeProfileValue(candidate);
};

const resolveThemeBrandValue = (
    theme: unknown,
    key: "logo_url" | "company_name"
): string | null => {
    const direct = readStringField(theme, key);
    if (direct) {
        return direct;
    }
    const dataNode =
        theme && typeof theme === "object"
            ? (theme as Record<string, unknown>).data
            : undefined;
    return readStringField(dataNode, key);
};

const fetchAgentProfile = async (): Promise<AgentProfileView | null> => {
    try {
        const response = await fetch(getApiUrl("/api/v1/ppt/profile"), {
            method: "GET",
            cache: "no-cache",
        });
        if (!response.ok) {
            return null;
        }
        const payload = (await response.json()) as AgentProfileView;
        return {
            agent_name: normalizeProfileValue(payload.agent_name),
            agency_name: normalizeProfileValue(payload.agency_name),
            email: normalizeProfileValue(payload.email),
            phone: normalizeProfileValue(payload.phone),
            booking_url: normalizeProfileValue(payload.booking_url),
            tagline: normalizeProfileValue(payload.tagline),
            logo_url: normalizeProfileValue(payload.logo_url),
        };
    } catch {
        return null;
    }
};




export const V1ContentRender = ({ slide, isEditMode, theme, viewMode = "deck" }: { slide: SlideLike, isEditMode: boolean, theme?: unknown, enableEditMode?: boolean, viewMode?: "deck" | "showcase" }) => {
    const dispatch = useDispatch();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [agentProfile, setAgentProfile] = useState<AgentProfileView | null>(
        cachedAgentProfile
    );

    const layout = slide.layout ?? "";
    const layoutGroup = slide.layout_group ?? "";
    const slideContent = useMemo(
        () =>
            slide.content && typeof slide.content === "object"
                ? (slide.content as Record<string, unknown>)
                : {},
        [slide.content]
    );
    const customTemplateId = layoutGroup.startsWith("custom-") ? layoutGroup.split("custom-")[1] : layoutGroup;
    const isCustomTemplate = uuidValidate(customTemplateId) || layoutGroup.startsWith("custom-");

    // Always call the hook (React hooks rule), but with empty id when not a custom template
    const { template: customTemplate, loading: customLoading } = useCustomTemplateDetails({
        id: isCustomTemplate ? customTemplateId : "",
        name: isCustomTemplate ? layoutGroup : "",
        description: ""
    });


    // Memoize layout resolution to prevent unnecessary recalculations
    const Layout = useMemo(() => {
        if (isCustomTemplate) {
            if (customTemplate) {
                const layoutId = layout.startsWith("custom-") ? layout.split(":")[1] : layout;


                const compiledLayout = customTemplate.layouts.find(
                    (layout) => layout.layoutId === layoutId
                );


                return compiledLayout?.component ?? null;
            }
            return null;
        } else {
            const template = getLayoutByLayoutId(layout);
            return template?.component ?? null;
        }
    }, [isCustomTemplate, customTemplate, layout]);

    useEffect(() => {
        let mounted = true;
        if (cachedAgentProfile) {
            return;
        }
        if (!inFlightAgentProfileRequest) {
            inFlightAgentProfileRequest = fetchAgentProfile().finally(() => {
                inFlightAgentProfileRequest = null;
            });
        }
        inFlightAgentProfileRequest.then((profile) => {
            if (!mounted) {
                return;
            }
            cachedAgentProfile = profile;
            setAgentProfile(profile);
        });
        return () => {
            mounted = false;
        };
    }, []);

    const slideDataWithMagicKeys = useMemo(() => {
        const fallbackCompanyName = resolveThemeBrandValue(theme, "company_name");
        const fallbackLogoUrl = resolveThemeBrandValue(theme, "logo_url");
        const agencyName = agentProfile?.agency_name ?? null;
        const logoUrl = agentProfile?.logo_url ?? fallbackLogoUrl;
        const companyName = agencyName ?? fallbackCompanyName;

        return {
            ...slideContent,
            _logo_url__: logoUrl,
            __companyName__: companyName,
            __agentName__: agentProfile?.agent_name ?? null,
            __agencyName__: agencyName ?? companyName,
            __agentEmail__: agentProfile?.email ?? null,
            __agentPhone__: agentProfile?.phone ?? null,
            __bookingUrl__: agentProfile?.booking_url ?? null,
            __agencyTagline__: agentProfile?.tagline ?? null,
        };
    }, [agentProfile, slideContent, theme]);

    // Show loading state for custom templates
    if (isCustomTemplate && customLoading) {
        return (
            <div className="flex flex-col items-center justify-center aspect-video h-full bg-gray-100 rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin" />
            </div>
        );
    }


    if (!Layout) {
        if (Object.keys(slideContent).length === 0) {
            return (
                <div className="flex flex-col items-center cursor-pointer justify-center aspect-video h-full bg-gray-100 rounded-lg">
                    <p className="text-gray-600 text-center text-base">Blank Slide</p>
                    <p className="text-gray-600 text-center text-sm">This slide is empty. Please add content to it using the edit button.</p>
                </div>
            )
        }
        return (
            <div className="flex flex-col items-center justify-center aspect-video h-full bg-gray-100 rounded-lg">
                <p className="text-gray-600 text-center text-base">
                    Layout &quot;{layout}&quot; not found in &quot;
                    {layoutGroup}&quot; Template
                </p>
            </div>
        );
    }
    const LayoutComp = Layout as ComponentType<{ data: Record<string, unknown>; viewMode?: "deck" | "showcase"; presentationId?: string; slideId?: string }>;

    if (isEditMode) {
        return (
            <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
                <div ref={containerRef} className={` `}>

                    <EditableLayoutWrapper
                        slideIndex={slide.index}
                        slideData={slideContent}
                        properties={slide.properties}
                    >
                        <TiptapTextReplacer
                            key={slide.id}
                            slideData={slideDataWithMagicKeys}
                            slideIndex={slide.index}
                            onContentChange={(
                                content: string,
                                dataPath: string,
                                slideIndex?: number
                            ) => {
                                if (dataPath && slideIndex !== undefined) {
                                    dispatch(
                                        updateSlideContent({
                                            slideIndex: slideIndex,
                                            dataPath: dataPath,
                                            content: content,
                                        })
                                    );
                                }
                            }}
                        >
                            <LayoutComp data={slideDataWithMagicKeys} viewMode={viewMode} slideId={slide.id ?? undefined} />
                        </TiptapTextReplacer>
                    </EditableLayoutWrapper>



                </div>
            </SlideErrorBoundary>

        );
    }
    return (
        <LayoutComp data={slideDataWithMagicKeys} viewMode={viewMode} slideId={slide.id ?? undefined} />
    )
};

