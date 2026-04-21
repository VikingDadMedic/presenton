import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import {
  clearPresentationData,
  markSkeletonReady,
  setPresentationData,
  setSkeletonSlides,
  setStreaming,
  updateSkeletonLayouts,
} from "@/store/slices/presentationGeneration";
import { jsonrepair } from "jsonrepair";
import { toast } from "sonner";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { getFastAPIUrl, resolveBackendAssetUrl } from "@/utils/api";

const MAX_STREAM_RETRIES = 3;
const STREAM_RETRY_DELAY_MS = 1_000;

const normalizePresentationAssets = <T,>(input: T): T => {
  if (Array.isArray(input)) {
    return input.map((item) => normalizePresentationAssets(item)) as T;
  }

  if (input && typeof input === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (typeof value === "string") {
        normalized[key] = resolveBackendAssetUrl(value);
      } else {
        normalized[key] = normalizePresentationAssets(value);
      }
    }
    return normalized as T;
  }

  return input;
};

const STREAM_FALLBACK_TIMEOUT_MS = 2 * 60 * 1000;

function removeStreamParam() {
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.delete("stream");
  window.history.replaceState({}, "", newUrl.toString());
}

export const usePresentationStreaming = (
  presentationId: string,
  stream: string | null,
  setLoading: (loading: boolean) => void,
  setError: (error: boolean) => void,
  fetchUserSlides: () => void
) => {
  const dispatch = useDispatch();
  const previousSlidesLength = useRef(0);
  const slidesReceivedRef = useRef(false);

  useEffect(() => {
    if (!stream) {
      fetchUserSlides();
      return;
    }

    let eventSource: EventSource | null = null;
    let accumulatedChunks = "";
    let retryCount = 0;
    let isClosed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const closeEventSource = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const finalizeFailure = (description: string) => {
      closeEventSource();
      clearRetryTimer();
      setLoading(false);
      dispatch(setStreaming(false));
      setError(true);
      toast.error("Presentation streaming failed", { description });
    };

    const scheduleRetry = (reason: string): boolean => {
      if (retryCount >= MAX_STREAM_RETRIES || isClosed) {
        return false;
      }

      retryCount += 1;
      const retryDelay = STREAM_RETRY_DELAY_MS * retryCount;
      console.warn(
        `Presentation stream retry ${retryCount}/${MAX_STREAM_RETRIES}: ${reason}`
      );

      closeEventSource();
      clearRetryTimer();
      accumulatedChunks = "";
      previousSlidesLength.current = 0;

      retryTimer = setTimeout(() => {
        if (!isClosed) {
          openStream();
        }
      }, retryDelay);

      return true;
    };

    const openStream = () => {
      closeEventSource();
      slidesReceivedRef.current = false;

      fallbackTimer = setTimeout(() => {
        if (!slidesReceivedRef.current) {
          console.warn("Stream fallback: no slides received after timeout, fetching from DB");
          closeEventSource();
          clearRetryTimer();
          setLoading(false);
          dispatch(setStreaming(false));
          removeStreamParam();
          fetchUserSlides();
        }
      }, STREAM_FALLBACK_TIMEOUT_MS);

      eventSource = new EventSource(
        `${getFastAPIUrl()}/api/v1/ppt/presentation/stream/${presentationId}`
      );

      eventSource.addEventListener("response", (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          if (!scheduleRetry("invalid SSE payload")) {
            finalizeFailure("Failed to parse stream response.");
          }
          return;
        }

        switch (data.type) {
          case "outlines":
            dispatch(
              setSkeletonSlides(
                (data.outlines as { content: string }[]).map((o) => ({
                  outlineText: o.content,
                  ready: false,
                }))
              )
            );
            setLoading(false);
            break;

          case "structure":
            dispatch(updateSkeletonLayouts(data.layouts as string[]));
            break;

          case "chunk":
            accumulatedChunks += data.chunk;
            try {
              const repairedJson = jsonrepair(accumulatedChunks);
              const partialData = JSON.parse(repairedJson);
              const normalizedPartialData = normalizePresentationAssets(partialData);

              if (normalizedPartialData.slides) {
                if (
                  normalizedPartialData.slides.length !== previousSlidesLength.current &&
                  normalizedPartialData.slides.length > 0
                ) {
                  dispatch(markSkeletonReady(partialData.slides.length));
                  dispatch(
                    setPresentationData({
                      ...normalizedPartialData,
                      slides: normalizedPartialData.slides,
                    })
                  );
                  previousSlidesLength.current = normalizedPartialData.slides.length;
                  slidesReceivedRef.current = true;
                  setLoading(false);
                }
              }
            } catch {
              // JSON isn't complete yet, continue accumulating
            }
            break;

          case "complete":
            try {
              dispatch(setPresentationData(normalizePresentationAssets(data.presentation)));
              slidesReceivedRef.current = true;
              dispatch(setStreaming(false));
              setLoading(false);
              isClosed = true;
              closeEventSource();
              clearRetryTimer();
              if (fallbackTimer) clearTimeout(fallbackTimer);
              retryCount = 0;
              removeStreamParam();
            } catch (error) {
              if (!scheduleRetry("failed to parse complete payload")) {
                finalizeFailure("Failed to parse final presentation payload.");
              }
            }
            accumulatedChunks = "";
            break;

          case "closing":
            dispatch(setPresentationData(normalizePresentationAssets(data.presentation)));
            slidesReceivedRef.current = true;
            setLoading(false);
            dispatch(setStreaming(false));
            isClosed = true;
            closeEventSource();
            clearRetryTimer();
            if (fallbackTimer) clearTimeout(fallbackTimer);
            retryCount = 0;
            removeStreamParam();
            break;

          case "error":
            if (fallbackTimer) clearTimeout(fallbackTimer);
            if (
              !scheduleRetry(
                data.detail || "server returned stream error response"
              )
            ) {
              finalizeFailure(
                data.detail ||
                  "Failed to connect to the server. Please try again."
              );
            }
            break;
        }
      });

      eventSource.onerror = (error) => {
        console.error("EventSource failed:", error);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (!scheduleRetry("connection lost")) {
          console.warn("Max retries exceeded, attempting to load from database...");
          closeEventSource();
          clearRetryTimer();
          setLoading(false);
          dispatch(setStreaming(false));
          removeStreamParam();
          fetchUserSlides();
        }
      };
    };

    dispatch(setStreaming(true));
    dispatch(clearPresentationData());
    trackEvent(MixpanelEvent.Presentation_Stream_API_Call);
    openStream();

    return () => {
      isClosed = true;
      closeEventSource();
      clearRetryTimer();
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [presentationId, stream, dispatch, setLoading, setError, fetchUserSlides]);
};
