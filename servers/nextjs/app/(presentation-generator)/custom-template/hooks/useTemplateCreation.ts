import { useState, useCallback } from "react";
import { toast } from "sonner";
import { getHeader, getHeaderForFormData } from "@/app/(presentation-generator)/services/api/header";
import { ApiResponseHandler } from "@/app/(presentation-generator)/services/api/api-error-handler";
import {
    TemplateCreationStep,
    TemplateCreationState,
    FontData,
    FontUploadPreviewResponse,
    TemplateReadinessResponse,
    SlideLayoutResponse,
    UploadedFont,
    ProcessedSlide,
} from "../types";
import { getApiUrl } from "@/utils/api";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

const initialState: TemplateCreationState = {
    step: 'file-upload',
    isLoading: false,
    error: null,
    fontsData: null,
    previewData: null,
    templateId: null,
    totalSlides: 0,
    slideLayouts: [],
    currentSlideIndex: 0,
};

const TEMPLATE_CREATION_CONCURRENCY = 3;


export const useTemplateCreation = () => {
    const [state, setState] = useState<TemplateCreationState>(initialState);
    const [uploadedFonts, setUploadedFonts] = useState<UploadedFont[]>([]);
    const [slides, setSlides] = useState<ProcessedSlide[]>([]);

    // Helper to update state partially
    const updateState = useCallback((updates: Partial<TemplateCreationState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    // Reset to initial state
    const reset = useCallback(() => {
        setState(initialState);
        setUploadedFonts([]);
        setSlides([]);
    }, []);

    // Step 1: Check fonts in PPTX file
    const checkFonts = useCallback(async (pptxFile: File): Promise<FontData | null> => {
        updateState({ isLoading: true, error: null });

        try {
            const extensionIndex = pptxFile.name.lastIndexOf(".");
            const fileExtension = extensionIndex >= 0 ? pptxFile.name.slice(extensionIndex).toLowerCase() : "";
            trackEvent(MixpanelEvent.CustomTemplate_Creation_Started, {
                source: "pptx_upload",
                file_name: pptxFile.name,
                file_size_bytes: pptxFile.size,
                file_extension: fileExtension,
            });
            const formData = new FormData();
            formData.append("pptx_file", pptxFile);

            const response = await fetch(getApiUrl(`/api/v1/ppt/fonts/check`), {
                method: "POST",
                headers: getHeaderForFormData(),
                body: formData,
            });

            const data = await ApiResponseHandler.handleResponse(
                response,
                "Failed to check fonts in the presentation"
            );

            updateState({
                fontsData: data,
                step: 'font-check',
                isLoading: false
            });

            return data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Font check failed";
            updateState({ error: errorMessage, isLoading: false });
            toast.error("Font Check Failed", { description: errorMessage });
            return null;
        }
    }, [updateState]);


    const uploadFont = useCallback((fontName: string, file: File): string | null => {
        // Check if font is already added
        const existingFont = uploadedFonts.find((f) => f.fontName === fontName);
        if (existingFont) {
            toast.info(`Font "${fontName}" is already added`);
            return fontName;
        }

        // Validate file type
        const validExtensions = [".ttf", ".otf", ".woff", ".woff2", ".eot"];
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));

        if (!validExtensions.includes(fileExtension)) {
            toast.error("Invalid font file type. Please upload .ttf, .otf, .woff, .woff2, or .eot files");
            return null;
        }

        // Validate file size (10MB limit)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            toast.error("Font file size must be less than 10MB");
            return null;
        }

        // Store font locally
        const newFont: UploadedFont = {
            fontName: fontName,
            fontUrl: '', // Will be set after upload
            fontPath: '',
            file: file,
        };

        setUploadedFonts(prev => [...prev, newFont]);
        toast.success(`Font "${fontName}" added`);
        return fontName;
    }, [uploadedFonts]);

    // Remove a font
    const removeFont = useCallback((fontName: string) => {
        setUploadedFonts(prev => prev.filter(font => font.fontName !== fontName));
        toast.info("Font removed");
    }, []);

    // Get all unsupported fonts that need upload
    const getUnsupportedFonts = useCallback((): string[] => {
        if (!state.fontsData?.unavailable_fonts) {
            return [];
        }
        return state.fontsData.unavailable_fonts
            .map(font => font.name)
            .filter(fontName => !uploadedFonts.some(uploaded => uploaded.fontName === fontName));
    }, [state.fontsData, uploadedFonts]);

    // Check if all required fonts are uploaded
    const allFontsUploaded = useCallback((): boolean => {
        return getUnsupportedFonts().length === 0;
    }, [getUnsupportedFonts]);

    // Step 2: Upload fonts and get slide preview
    const fontUploadAndPreview = useCallback(async (
        pptxFile: File
    ): Promise<FontUploadPreviewResponse | null> => {
        updateState({ isLoading: true, error: null, step: 'font-upload' });

        try {
            const formData = new FormData();
            formData.append("pptx_file", pptxFile);

            // Add uploaded font files (actual File objects)
            uploadedFonts.forEach(font => {
                formData.append("font_files", font.file);
                formData.append("original_font_names", font.fontName);
            });

            const response = await fetch(
                getApiUrl(`/api/v1/ppt/template/fonts-upload-and-slides-preview`),
                {
                    method: "POST",
                    headers: getHeaderForFormData(),
                    body: formData,
                }
            );

            const data = await ApiResponseHandler.handleResponse(
                response,
                "Failed to upload fonts and preview slides"
            );

            updateState({
                previewData: data,
                step: 'slides-preview',
                isLoading: false
            });

            if (data.total_original_slides > data.processed_slide_count) {
                toast.warning(
                    `Your deck has ${data.total_original_slides} slides; only the first ${data.processed_slide_count} will be processed.`
                );
            }
            toast.success("Slides preview generated successfully");
            return data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Preview generation failed";
            updateState({ error: errorMessage, isLoading: false });
            toast.error("Preview Failed", { description: errorMessage });
            return null;
        }
    }, [uploadedFonts, updateState]);

    const checkReadiness = useCallback(async (
        signal?: AbortSignal
    ): Promise<TemplateReadinessResponse | null> => {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/readiness`), {
                method: "GET",
                headers: getHeader(),
                signal,
            });
            const data = await ApiResponseHandler.handleResponse(
                response,
                "Failed to check template generation readiness"
            );
            return data as TemplateReadinessResponse;
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return null;
            }
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "Unable to verify template generation readiness";
            return {
                ready: false,
                reason: errorMessage,
            };
        }
    }, []);

    // Step 3: Initialize template creation
    const initTemplateCreation = useCallback(async (): Promise<string | null> => {
        if (!state.previewData) {
            toast.error("No preview data available");
            return null;
        }

        updateState({ isLoading: true, error: null, step: 'template-creation' });

        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/create/init`), {
                method: "POST",
                headers: getHeader(),
                body: JSON.stringify({
                    pptx_url: state.previewData.modified_pptx_url,
                    slide_image_urls: state.previewData.slide_image_urls,
                    fonts: state.previewData.fonts,
                }),
            });

            const data = await ApiResponseHandler.handleResponse(
                response,
                "Failed to initialize template creation"
            );

            // Initialize slides array based on preview images
            const initialSlides: ProcessedSlide[] = state.previewData.slide_image_urls.map(
                (url, index) => ({
                    slide_number: index + 1,
                    screenshot_url: url,
                    processing: false,
                    processed: false,
                })
            );

            setSlides(initialSlides);
            updateState({
                templateId: data.id || data,
                totalSlides: state.previewData.slide_image_urls.length,
                isLoading: false
            });
            trackEvent(MixpanelEvent.CustomTemplate_Creation_Started, {
                source: "template_init",
                template_id: typeof data === "string" ? data : data.id,
                total_slides: state.previewData.slide_image_urls.length,
                uploaded_font_count: state.previewData.fonts?.length || 0,
            });

            toast.success("Template creation initialized");

            const resolvedTemplateId = typeof data === "string" ? data : data.id;
            if (resolvedTemplateId) {
                const previewSlideCount = state.previewData.slide_image_urls.length;
                setTimeout(() => {
                    void processAllSlidesInParallel(
                        resolvedTemplateId,
                        previewSlideCount
                    );
                }, 0);
            }

            return resolvedTemplateId;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Initialization failed";
            updateState({ error: errorMessage, isLoading: false });
            toast.error("Initialization Failed", { description: errorMessage });
            // reset the state
            reset();
            return null;
        }
    // biome-ignore lint/correctness/useExhaustiveDependencies: Including processAllSlidesInParallel here causes a declaration-order hook cycle.
    }, [reset, state.previewData, updateState]);

    // Step 4: Create slide layout for a specific slide
    const createSlideLayout = useCallback(async (
        templateId: string,
        slideIndex: number,
        retry: boolean = false,
        _isAutoRetry: boolean = false,
        showSuccessToast: boolean = false
    ): Promise<SlideLayoutResponse | null> => {
        // Mark slide as processing
        setSlides(prev => prev.map((s, i) =>
            i === slideIndex ? { ...s, processing: true, error: undefined } : s
        ));

        updateState({ currentSlideIndex: slideIndex });

        try {
            const startResponse = await fetch(
                getApiUrl(`/api/v1/ppt/template/slide-layout/create/start`),
                {
                    method: "POST",
                    headers: getHeader(),
                    body: JSON.stringify({
                        id: templateId,
                        index: slideIndex,
                    }),
                }
            );

            const startData = await ApiResponseHandler.handleResponse(
                startResponse,
                `Failed to start layout job for slide ${slideIndex + 1}`
            );
            const jobId = startData.job_id as string;

            const pollMs = 2000;
            const maxWaitMs = 45 * 60 * 1000;
            const deadline = Date.now() + maxWaitMs;
            let data: { react_component: string } | undefined;

            while (Date.now() < deadline) {
                const statusResponse = await fetch(
                    getApiUrl(`/api/v1/ppt/template/slide-layout/create/job/${encodeURIComponent(jobId)}`),
                    { headers: getHeader() }
                );
                const statusData = await ApiResponseHandler.handleResponse(
                    statusResponse,
                    `Failed to check layout job for slide ${slideIndex + 1}`
                );
                if (statusData.status === "complete" && statusData.react_component) {
                    data = { react_component: statusData.react_component };
                    break;
                }
                if (statusData.status === "failed") {
                    throw new Error(
                        statusData.error ||
                            `Layout generation failed for slide ${slideIndex + 1}`
                    );
                }
                await new Promise((r) => setTimeout(r, pollMs));
            }

            if (!data) {
                throw new Error(
                    "Timed out waiting for slide layout generation (exceeded 45 minutes)"
                );
            }

            const layoutResult: SlideLayoutResponse = {
                slide_index: slideIndex,
                react_component: data.react_component,
                layout_id: "",
                layout_name: "",
            };

            // Update slide with the react component
            setSlides(prev => {
                const newSlides = prev.map((s, i) =>
                    i === slideIndex ? {
                        ...s,
                        processing: false,
                        processed: true,
                        react: layoutResult.react_component,
                        layout_id: layoutResult.layout_id || undefined,
                        layout_name: layoutResult.layout_name || undefined,
                    } : s
                );

                if (showSuccessToast) {
                    toast.success(`Slide ${slideIndex + 1} reconstructed successfully`);
                }

                return newSlides;
            });

            return layoutResult;
        } catch (error) {
            // Auto-retry once on failure before showing error
            if (!_isAutoRetry) {
                console.log(`Auto-retrying slide ${slideIndex + 1} after API failure...`);
                return createSlideLayout(templateId, slideIndex, true, true, showSuccessToast);
            }

            const errorMessage = error instanceof Error ? error.message : "Layout creation failed";

            // Mark slide with error
            setSlides(prev => {
                const newSlides = prev.map((s, i) =>
                    i === slideIndex ? { ...s, processing: false, error: errorMessage } : s
                );
                return newSlides;
            });

            toast.error(`Slide ${slideIndex + 1} Failed`, { description: errorMessage });
            return null;
        }
    }, [updateState]);

    const processAllSlidesInParallel = useCallback(
        async (templateId: string, totalSlides: number) => {
            if (totalSlides <= 0) {
                return;
            }

            let nextIndex = 0;
            const worker = async () => {
                while (true) {
                    const currentIndex = nextIndex;
                    nextIndex += 1;
                    if (currentIndex >= totalSlides) {
                        return;
                    }
                    await createSlideLayout(templateId, currentIndex, false, false, false);
                }
            };

            const workerCount = Math.min(TEMPLATE_CREATION_CONCURRENCY, totalSlides);
            await Promise.all(Array.from({ length: workerCount }, worker));

            setSlides((prev) => {
                const allProcessed = prev.every((slide) => slide.processed || slide.error);
                if (allProcessed) {
                    updateState({ step: "completed" });
                    trackEvent(MixpanelEvent.CustomTemplate_Creation_Completed, {
                        template_id: templateId,
                        total_slides: prev.length,
                        processed_slides: prev.filter((slide) => slide.processed).length,
                        failed_slides: prev.filter((slide) => Boolean(slide.error)).length,
                    });
                    toast.success("All slides processed successfully!");
                }
                return prev;
            });
        },
        [createSlideLayout, updateState]
    );

    // Reconstruct a single slide
    const retrySlide = useCallback((slideIndex: number) => {
        if (state.templateId) {
            void createSlideLayout(state.templateId, slideIndex, true, false, true);
        }
    }, [state.templateId, createSlideLayout]);

    // Move to font upload step (when font check is done)
    const proceedToFontUpload = useCallback(() => {
        updateState({ step: 'font-upload' });
    }, [updateState]);

    // Calculate progress
    const completedSlides = slides.filter(s => s.processed || s.error).length;
    const progressPercentage = state.totalSlides > 0
        ? Math.round((completedSlides / state.totalSlides) * 100)
        : 0;

    return {
        // State
        state,
        uploadedFonts,
        slides,
        setSlides,

        // Progress
        completedSlides,
        progressPercentage,

        // Font operations
        checkFonts,
        checkReadiness,
        uploadFont,
        removeFont,
        getUnsupportedFonts,
        allFontsUploaded,

        // Template creation operations
        fontUploadAndPreview,
        initTemplateCreation,
        createSlideLayout,
        retrySlide,

        // Navigation
        proceedToFontUpload,
        reset,
        updateState,
    };
};
