"use client";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import "../../utils/prism-languages";
import { Skeleton } from "@/components/ui/skeleton";
import PresentationMode from "./PresentationMode";
import SidePanel from "./SidePanel";
import SlideContent from "./SlideContent";
import SlideSkeleton from "./SlideSkeleton";
import Chat from "./Chat";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/lib/use-is-mobile";
import { usePathname, useRouter } from "next/navigation";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { AlertCircle, MessageCircle } from "lucide-react";
import {
  usePresentationStreaming,
  usePresentationData,
  usePresentationNavigation,
  useAutoSave,
} from "../hooks";
import { PresentationPageProps } from "../types";
import LoadingState from "./LoadingState";
import { applyPresentationThemeToElement } from "../utils/applyPresentationThemeDom";

import { usePresentationUndoRedo } from "../hooks/PresentationUndoRedo";
import PresentationHeader from "./PresentationHeader";

const PresentationPage: React.FC<PresentationPageProps> = ({
  presentation_id,
}) => {
  const pathname = usePathname();
  // State management
  const [loading, setLoading] = useState(true);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState(false);
  const [isChatSheetOpen, setIsChatSheetOpen] = useState(false);
  const router = useRouter();
  const isMobile = useIsMobile();



  const { presentationData, isStreaming, skeletonSlides } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  // Auto-save functionality
  const { isSaving } = useAutoSave({
    debounceMs: 2000,
    enabled: !!presentationData && !isStreaming,
  });

  // Custom hooks
  const { fetchUserSlides } = usePresentationData(
    presentation_id,
    setLoading,
    setError
  );

  const {
    isPresentMode,
    stream,
    currentSlide: presentSlideFromUrl,
    handleSlideClick,
    toggleFullscreen,
    handlePresentExit,
    handleSlideChange,
  } = usePresentationNavigation(
    presentation_id,
    selectedSlide,
    setSelectedSlide,
    setIsFullscreen
  );

  // Initialize streaming
  usePresentationStreaming(
    presentation_id,
    stream,
    setLoading,
    setError,
    fetchUserSlides
  );

  usePresentationUndoRedo();

  useEffect(() => {
    trackEvent(MixpanelEvent.Presentation_Editor_Viewed, {
      pathname,
      presentation_id,
      stream_mode: !!stream,
      presentation_mode: isPresentMode ? "present" : "edit",
    });
  }, [pathname, presentation_id, stream, isPresentMode]);

  /** Editor tree unmounts in present mode; remount loses inline theme CSS — re-apply from Redux. */
  useLayoutEffect(() => {
    if (isPresentMode) return;
    const theme = presentationData?.theme;
    if (!theme) return;
    const el = document.getElementById("presentation-slides-wrapper");
    applyPresentationThemeToElement(el, theme);
  }, [isPresentMode, presentationData?.theme]);

  const onSlideChange = (newSlide: number) => {
    handleSlideChange(newSlide, presentationData);
  };


  // Presentation Mode View
  if (isPresentMode) {
    return (
      <PresentationMode
        slides={presentationData?.slides!}
        currentSlide={presentSlideFromUrl}
        theme={presentationData?.theme ?? undefined}
        isFullscreen={isFullscreen}
        onFullscreenToggle={toggleFullscreen}
        onExit={handlePresentExit}
        onSlideChange={onSlideChange}
      />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-muted font-display">
        <div
          className="bg-card border border-red-300 text-red-700 px-6 py-8 rounded-lg shadow-lg flex flex-col items-center"
          role="alert"
        >
          <AlertCircle className="w-16 h-16 mb-4 text-red-500" />
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-center mb-4">
            We couldn't load your presentation. Please try again.
          </p>
          <div className="flex gap-2 justify-center items-center">

            <Button onClick={() => { trackEvent(MixpanelEvent.PresentationPage_Refresh_Page_Button_Clicked, { pathname }); window.location.reload(); }}>Refresh Page</Button>
            <Button onClick={() => { trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/upload" }); router.push("/upload"); }}>Go to Upload</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden font-display ">
      <div
        style={{
          background: "var(--card, #ffffff)",
        }}
        id="presentation-slides-wrapper"
        className="flex  gap-6 relative "
      >
        <div className="w-[200px]">
          <SidePanel
            selectedSlide={selectedSlide}
            onSlideClick={handleSlideClick}
            presentationId={presentation_id}
            loading={loading}
          />
        </div>
        <div className="min-w-0 w-full h-[calc(100vh-20px)] pr-[25px] pl-2 overflow-y-auto">
          <PresentationHeader presentation_id={presentation_id} isPresentationSaving={isSaving} currentSlide={selectedSlide} />
          <div

            style={{
              background: "color-mix(in srgb, var(--card) 10%, transparent)",
              boxShadow: "0 0 20px 0 color-mix(in srgb, var(--primary) 16%, transparent) inset",
            }}
            className="p-6 rounded-[20px] font-sans flex flex-col items-center overflow-hidden justify-center  border border-border "
          >
            <div className="w-full max-w-[1280px] h-full">

              {!presentationData ||
                loading ||
                !presentationData?.slides ||
                presentationData?.slides.length === 0 ? (
                skeletonSlides.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {skeletonSlides.map((sk, i) => (
                      <SlideSkeleton
                        key={`skeleton-${i}`}
                        outlineText={sk.outlineText}
                        layoutName={sk.layoutName}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="relative w-full h-[calc(100vh-120px)] mx-auto">
                    <div className="">
                      {Array.from({ length: 2 }).map((_, index) => (
                        <Skeleton
                          key={index}
                          className="aspect-video bg-muted-foreground/20 my-4 w-full mx-auto "
                        />
                      ))}
                    </div>
                    {stream && <LoadingState />}
                  </div>
                )
              ) : (
                <>
                  {presentationData.slides.map((slide: any, index: number) => (
                    <SlideContent
                      key={`${slide.type}-${index}-${slide.index}`}
                      slide={slide}
                      index={index}
                      presentationId={presentation_id}
                    />
                  ))}
                  {isStreaming &&
                    skeletonSlides.slice(presentationData.slides.length).map((sk, i) => (
                      <SlideSkeleton
                        key={`skeleton-pending-${presentationData.slides.length + i}`}
                        outlineText={sk.outlineText}
                        layoutName={sk.layoutName}
                      />
                    ))}
                </>
              )}
            </div>
          </div>
        </div>
        {/* Phase 11.0b.5 mobile drawer skeleton: 3rd column at md: and above
            (existing layout); collapses into a right-side <Sheet> below md:
            with a floating Chat toggle button. Full mobile UX polish (gesture
            dismissal, keyboard-avoidance for the composer, responsive typography
            inside Chat itself) lives on the Phase 11.x deferred batch. */}
        {isMobile ? (
          <Sheet open={isChatSheetOpen} onOpenChange={setIsChatSheetOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="default"
                aria-label="Open chat assistant"
                className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-lg md:hidden"
                onClick={() => {
                  trackEvent(MixpanelEvent.PresentationPage_Chat_Sheet_Opened, {
                    presentation_id,
                    selected_slide: selectedSlide,
                  });
                }}
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full p-0 sm:max-w-[420px]"
            >
              <SheetTitle className="sr-only">Chat assistant</SheetTitle>
              <SheetDescription className="sr-only">
                Edit slides and ask questions about this presentation.
              </SheetDescription>
              <div className="h-full w-full">
                <Chat
                  presentationId={presentation_id}
                  currentSlide={selectedSlide}
                  onPresentationChanged={fetchUserSlides}
                />
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <div className="w-full max-w-[370px] min-w-[280px] h-full shrink self-start sticky top-0 hidden md:block">
            <Chat
              presentationId={presentation_id}
              currentSlide={selectedSlide}
              onPresentationChanged={fetchUserSlides}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default PresentationPage;
