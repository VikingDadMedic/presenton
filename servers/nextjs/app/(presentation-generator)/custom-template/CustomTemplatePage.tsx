"use client";



import React, { useEffect, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";



import { useFileUpload } from "./hooks/useFileUpload";
import { useTemplateCreation } from "./hooks/useTemplateCreation";
import { useLayoutSaving } from "./hooks/useLayoutSaving";

import { ProcessedSlide } from "./types";
import { TAILWIND_CDN_URL } from "./constants";
import { TemplateStudioHeader } from "./components/TemplateStudioHeader";
import { TemplateCreationProgress } from "./components/TemplateCreationProgress";
import { Step2FontManagement } from "./components/steps/Step2FontManagement";
import { Step3SlidePreview } from "./components/steps/Step3SlidePreview";
import { Step4TemplateCreation } from "./components/steps/Step4TemplateCreation";
import { SaveLayoutButton } from "./components/SaveLayoutButton";
import { SaveLayoutModal } from "./components/SaveLayoutModal";
import { FileUploadSection } from "./components/FileUploadSection";

import { useFontLoader } from "../hooks/useFontLoad";
import Header from "@/app/(presentation-generator)/(dashboard)/dashboard/components/Header";
import { RootState } from "@/store/store";





const CustomTemplatePage = () => {
    const router = useRouter();
    const { llm_config } = useSelector((state: RootState) => state.userConfig);

    const [schemaEditorSlideIndex, setSchemaEditorSlideIndex] = useState<number | null>(null);
    const [schemaPreviewData, setSchemaPreviewData] = useState<Record<number, Record<string, any>>>({});
    const [templateReadiness, setTemplateReadiness] = useState<{
        ready: boolean;
        reason: string | null;
    }>({
        ready: true,
        reason: null,
    });

    const { selectedFile, handleFileSelect, removeFile } = useFileUpload();


    const {
        state,
        uploadedFonts,
        slides,
        setSlides,
        completedSlides,
        checkFonts,
        checkReadiness,
        uploadFont,
        removeFont,
        fontUploadAndPreview,
        initTemplateCreation,
        retrySlide,
    } = useTemplateCreation();

    // Layout saving hook
    const {
        isSavingLayout,
        isModalOpen,
        openSaveModal,
        closeSaveModal,
        saveLayout,
    } = useLayoutSaving(slides);


    useEffect(() => {
        const existingScript = document.querySelector('script[src*="tailwindcss.com"]');
        if (!existingScript) {
            const script = document.createElement("script");
            script.src = TAILWIND_CDN_URL;
            script.async = true;
            document.head.appendChild(script);
        }
    }, []);

    useEffect(() => {
        const readinessDependency = [
            llm_config?.LLM ?? "",
            llm_config?.OPENAI_MODEL ?? "",
            llm_config?.GOOGLE_MODEL ?? "",
            llm_config?.ANTHROPIC_MODEL ?? "",
            llm_config?.CODEX_MODEL ?? "",
            llm_config?.OPENAI_API_KEY ? "openai-key:set" : "openai-key:unset",
            llm_config?.GOOGLE_API_KEY ? "google-key:set" : "google-key:unset",
            llm_config?.ANTHROPIC_API_KEY ? "anthropic-key:set" : "anthropic-key:unset",
            llm_config?.CODEX_ACCESS_TOKEN ? "codex-token:set" : "codex-token:unset",
        ].join("|");
        let isMounted = true;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => {
            if (!readinessDependency && !isMounted) {
                return;
            }
            const loadTemplateReadiness = async () => {
                const readiness = await checkReadiness(controller.signal);
                if (!isMounted || !readiness) {
                    return;
                }
                setTemplateReadiness({
                    ready: readiness.ready,
                    reason: readiness.reason ?? null,
                });
            };

            void loadTemplateReadiness();
        }, 250);

        return () => {
            isMounted = false;
            controller.abort();
            window.clearTimeout(timeout);
        };
    }, [
        checkReadiness,
        llm_config?.LLM,
        llm_config?.OPENAI_MODEL,
        llm_config?.GOOGLE_MODEL,
        llm_config?.ANTHROPIC_MODEL,
        llm_config?.CODEX_MODEL,
        llm_config?.OPENAI_API_KEY,
        llm_config?.GOOGLE_API_KEY,
        llm_config?.ANTHROPIC_API_KEY,
        llm_config?.CODEX_ACCESS_TOKEN,
    ]);


    /**
     * Step 1: Check fonts in uploaded PPTX
     */
    const handleCheckFonts = useCallback(async () => {


        if (selectedFile) {
            await checkFonts(selectedFile);
        }
    }, [selectedFile, checkFonts]);

    /**
     * Step 2: Upload fonts and generate preview
     */
    const handleFontUploadAndPreview = useCallback(async () => {
        if (selectedFile) {
            const data = await fontUploadAndPreview(selectedFile);
            if (data) {
                useFontLoader(data.fonts);
            }
        }
    }, [selectedFile, fontUploadAndPreview]);

    /**
     * Step 5: Save template with metadata
     */
    const handleSaveTemplate = useCallback(async (
        layoutName: string,
        description: string,
        template_info_id: string
    ): Promise<string | null> => {
        const id = await saveLayout(layoutName, description, template_info_id);
        if (id) {
            router.push(`/template-preview?slug=custom-${id}`);
        }
        return id;
    }, [saveLayout, router]);

    /**
     * Update a specific slide's data
     */
    const handleSlideUpdate = useCallback((index: number, updatedSlideData: Partial<ProcessedSlide>) => {
        setSlides((prevSlides) =>
            prevSlides.map((s, i) =>
                i === index
                    ? { ...s, ...updatedSlideData, modified: true }
                    : s
            )
        );
    }, [setSlides]);


    /**
     * Open schema editor for a specific slide
     */
    const handleOpenSchemaEditor = useCallback((index: number | null) => {
        setSchemaEditorSlideIndex(index);
    }, []);

    /**
     * Close schema editor
     */
    const handleCloseSchemaEditor = useCallback(() => {
        setSchemaEditorSlideIndex(null);
    }, []);

    /**
     * Save changes from schema editor
     */
    const handleSchemaEditorSave = useCallback((updatedReact: string) => {
        if (schemaEditorSlideIndex !== null) {
            setSlides(prev => prev.map((s, i) =>
                i === schemaEditorSlideIndex ? { ...s, react: updatedReact } : s
            ));
        }
        setSchemaEditorSlideIndex(null);
    }, [schemaEditorSlideIndex, setSlides]);

    /**
     * Update schema preview content (for AI fill)
     */
    const handleSchemaPreviewContent = useCallback((content: Record<string, any>) => {
        if (schemaEditorSlideIndex !== null) {
            setSchemaPreviewData(prev => ({
                ...prev,
                [schemaEditorSlideIndex]: content
            }));
        }
    }, [schemaEditorSlideIndex]);

    /**
     * Clear schema preview data for a specific slide
     */
    const handleClearSchemaPreview = useCallback((slideIndex: number) => {
        setSchemaPreviewData(prev => {
            const newData = { ...prev };
            delete newData[slideIndex];
            return newData;
        });
    }, []);



    const showFileUpload = state.step === 'file-upload';
    const showFontManager = state.step === 'font-check' || state.step === 'font-upload';
    const showPreview = state.step === 'slides-preview';
    const showSlides = state.step === 'template-creation' || state.step === 'completed';
    const isProcessingCompleted = state.step === 'completed';



    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">

            <Header />
            <TemplateStudioHeader />
            {showFileUpload ? (
                <div className="pb-24">
                    {!templateReadiness.ready && (
                        <div className="mx-auto mb-4 max-w-[650px] rounded-lg border border-amber-300/40 bg-amber-100/40 px-4 py-3 text-sm text-amber-900">
                            <p className="font-semibold">Template generation is not ready.</p>
                            <p className="mt-1">
                                {templateReadiness.reason ??
                                    "Please configure a supported provider and credentials in Settings."}
                            </p>
                            <Link href="/settings" className="mt-2 inline-flex underline underline-offset-4">
                                Open Settings
                            </Link>
                        </div>
                    )}
                    <FileUploadSection
                        selectedFile={selectedFile}
                        handleFileSelect={handleFileSelect}
                        removeFile={removeFile}
                        CheckFonts={handleCheckFonts}
                        isUploadEnabled={templateReadiness.ready}
                        isProcessingPptx={state.isLoading}
                        slides={[]}
                        completedSlides={0}
                    />

                </div>
            ) : (
                <div className="mx-auto min-h-[600px] px-6 pb-24">

                    <TemplateCreationProgress
                        currentStep={state.step}
                        totalSlides={state.totalSlides}
                        processedSlides={completedSlides}
                    />

                    {/* Step 2: Font Management */}
                    {showFontManager && (
                        <Step2FontManagement
                            fontsData={state.fontsData}
                            uploadedFonts={uploadedFonts}
                            uploadFont={uploadFont}
                            removeFont={removeFont}
                            onContinue={handleFontUploadAndPreview}
                            isUploading={state.isLoading}
                        />
                    )}

                    {/* Step 3: Slide Preview */}
                    {showPreview && (
                        <Step3SlidePreview
                            previewData={state.previewData}
                            onInitTemplate={initTemplateCreation}
                            isLoading={state.isLoading}
                        />
                    )}

                    {/* Step 4: Template Creation & Editing */}
                    {showSlides && slides.length > 0 && (
                        <Step4TemplateCreation
                            slides={slides}
                            setSlides={setSlides}
                            retrySlide={retrySlide}
                            onSlideUpdate={handleSlideUpdate}
                            schemaEditorSlideIndex={schemaEditorSlideIndex}
                            onOpenSchemaEditor={handleOpenSchemaEditor}
                            onCloseSchemaEditor={handleCloseSchemaEditor}
                            onSchemaEditorSave={handleSchemaEditorSave}
                            schemaPreviewData={schemaPreviewData}
                            onSchemaPreviewContent={handleSchemaPreviewContent}
                            onClearSchemaPreview={handleClearSchemaPreview}
                        />
                    )}

                    {/* Floating Save Template Button */}
                    {isProcessingCompleted && slides.some((s) => s.processed) && (
                        <SaveLayoutButton
                            onSave={openSaveModal}
                            isSaving={isSavingLayout}
                            isProcessing={slides.some((s) => s.processing)}
                        />
                    )}

                    {/* Save Template Modal */}
                    <SaveLayoutModal
                        isOpen={isModalOpen}
                        onClose={closeSaveModal}
                        onSave={handleSaveTemplate}
                        isSaving={isSavingLayout}
                        template_info_id={state.templateId || ''}
                    />
                </div>
            )}

        </div>
    );
};

export default CustomTemplatePage;
