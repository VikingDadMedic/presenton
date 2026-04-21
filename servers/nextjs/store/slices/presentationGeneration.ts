import { Theme } from "@/app/(presentation-generator)/services/api/types";
import { Slide } from "@/app/(presentation-generator)/types/slide";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

/* eslint-disable @typescript-eslint/no-explicit-any */
function navigateToParent(obj: any, path: string): { parent: any; finalKey: string } | null {
  const keys = path.split(/[.\[\]]+/).filter(Boolean);
  if (keys.length === 0) return null;
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const idx = Number(key);
    const next = Number.isNaN(idx) ? current[key] : current[idx];
    if (!next) {
      const created = {};
      if (Number.isNaN(idx)) current[key] = created;
      else current[idx] = created;
      current = created;
    } else {
      current = next;
    }
  }

  return { parent: current, finalKey: keys[keys.length - 1] };
}

function setAtPath(parent: any, finalKey: string, value: any): void {
  if (Number.isNaN(Number(finalKey))) parent[finalKey] = value;
  else parent[Number(finalKey)] = value;
}

function getAtPath(parent: any, finalKey: string): any {
  return Number.isNaN(Number(finalKey)) ? parent[finalKey] : parent[Number(finalKey)];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface LayoutSlideEntry {
  id: string;
  name?: string;
  description?: string;
  json_schema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PresentationData {
  id: string;
  language: string;
  layout: {
    name: string;
    ordered: boolean;
    slides: LayoutSlideEntry[];
  };
  n_slides: number;
  title: string;
  slides: Slide[];
  theme: Theme | null;
}

export interface SkeletonSlide {
  outlineText?: string;
  layoutName?: string;
  ready: boolean;
}

interface PresentationGenerationState {
  presentation_id: string | null;
  isLoading: boolean;
  isStreaming: boolean | null;
  outlines: { content: string }[];
  error: string | null;
  presentationData: PresentationData | null;
  skeletonSlides: SkeletonSlide[];
  isSlidesRendered: boolean;
  isLayoutLoading: boolean;
}

const initialState: PresentationGenerationState = {
  presentation_id: null,
  outlines: [],
  isSlidesRendered: false,
  isLayoutLoading: false,
  isLoading: false,
  isStreaming: null,
  error: null,
  presentationData: null,
  skeletonSlides: [],
};

const presentationGenerationSlice = createSlice({
  name: "presentationGeneration",
  initialState,
  reducers: {
    setStreaming: (state, action: PayloadAction<boolean>) => {
      state.isStreaming = action.payload;
    },
    // Loading
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setLayoutLoading: (state, action: PayloadAction<boolean>) => {
      state.isLayoutLoading = action.payload;
    },
    // Presentation ID
    setPresentationId: (state, action: PayloadAction<string>) => {
      state.presentation_id = action.payload;
      state.error = null;
    },
    // Slides rendered
    setSlidesRendered: (state, action: PayloadAction<boolean>) => {
      state.isSlidesRendered = action.payload;
    },
    // Error
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    // Clear presentation data
    clearPresentationData: (state) => {
      state.presentationData = null;
      state.skeletonSlides = [];
    },
    setSkeletonSlides: (state, action: PayloadAction<SkeletonSlide[]>) => {
      state.skeletonSlides = action.payload;
    },
    updateSkeletonLayouts: (state, action: PayloadAction<string[]>) => {
      action.payload.forEach((layoutName, i) => {
        if (state.skeletonSlides[i]) {
          state.skeletonSlides[i].layoutName = layoutName;
        }
      });
    },
    markSkeletonReady: (state, action: PayloadAction<number>) => {
      const count = action.payload;
      for (let i = 0; i < count && i < state.skeletonSlides.length; i++) {
        state.skeletonSlides[i].ready = true;
      }
    },
    clearOutlines: (state) => {
      state.outlines = [];
    },
    // Set outlines
    setOutlines: (state, action: PayloadAction<{ content: string }[]>) => {
      state.outlines = action.payload;
    },
    // Set presentation data
    setPresentationData: (state, action: PayloadAction<PresentationData>) => {
      state.presentationData = action.payload;
    },
    updateTitle: (state, action: PayloadAction<string>) => {
      if (state.presentationData) {
        state.presentationData.title = action.payload;
      }
    },
    deleteSlideOutline: (state, action: PayloadAction<{ index: number }>) => {
      if (state.outlines) {
        // Remove the slide at the given index
        state.outlines = state.outlines.filter(
          (_, idx) => idx !== action.payload.index
        );
      }
    },
    // SLIDE OPERATIONS
    addSlide: (
      state,
      action: PayloadAction<{ slide: Slide; index: number }>
    ) => {
      if (state.presentationData?.slides) {
        // Insert the new slide at the specified index
        state.presentationData.slides.splice(
          action.payload.index,
          0,
          action.payload.slide
        );

        // Update indices for all slides to ensure they remain sequential
        state.presentationData.slides = state.presentationData.slides.map(
          (slide: any, idx: number) => ({
            ...slide,
            index: idx,
          })
        );
      }
    },
    deletePresentationSlide: (state, action: PayloadAction<number>) => {
      if (state.presentationData) {
        state.presentationData.slides.splice(action.payload, 1);
        state.presentationData.slides = state.presentationData.slides.map(
          (slide: any, idx: number) => ({
            ...slide,
            index: idx,
          })
        );
      }
    },
    updateSlide: (
      state,
      action: PayloadAction<{ index: number; slide: Slide }>
    ) => {
      if (
        state.presentationData &&
        state.presentationData.slides[action.payload.index]
      ) {
        state.presentationData.slides[action.payload.index] =
          action.payload.slide;
      }
    },

    updateSlideContent: (
      state,
      action: PayloadAction<{
        slideIndex: number;
        dataPath: string;
        content: any;
      }>
    ) => {
      const slide = state.presentationData?.slides?.[action.payload.slideIndex];
      if (!slide?.content || !action.payload.dataPath) return;

      const nav = navigateToParent(slide.content, action.payload.dataPath);
      if (nav) setAtPath(nav.parent, nav.finalKey, action.payload.content);
    },

    addNewSlide: (state, action: PayloadAction<{ slideData: any; index: number }>) => {
      if (state.presentationData?.slides) {
        // Insert the new slide at the specified index + 1 (after current slide)
        state.presentationData.slides.splice(action.payload.index + 1, 0, action.payload.slideData);

        // Update indices for all slides to ensure they remain sequential
        state.presentationData.slides = state.presentationData.slides.map(
          (slide: any, idx: number) => ({
            ...slide,
            index: idx,
          })
        );
      }
    },

    updateSlideImage: (
      state,
      action: PayloadAction<{
        slideIndex: number;
        dataPath: string;
        imageUrl: string;
        prompt?: string;
      }>
    ) => {
      const slide = state.presentationData?.slides?.[action.payload.slideIndex];
      if (!slide?.content || !action.payload.dataPath) return;

      const { dataPath, imageUrl, prompt } = action.payload;
      const nav = navigateToParent(slide.content, dataPath);
      if (nav) {
        const target = getAtPath(nav.parent, nav.finalKey);
        const updatedValue = {
          ...(target && typeof target === 'object' ? target : {}),
          __image_url__: imageUrl,
          __image_prompt__: prompt || (target?.__image_prompt__) || ''
        };
        setAtPath(nav.parent, nav.finalKey, updatedValue);
      }

      if (slide.images && Array.isArray(slide.images)) {
        const imageIndex = parseInt(dataPath.split('[')[1]?.split(']')[0]) || 0;
        if (slide.images[imageIndex] !== undefined) {
          slide.images[imageIndex] = imageUrl;
        }
      }
    },

    updateImageProperties: (
      state,
      action: PayloadAction<{
        slideIndex: number;
        itemIndex: number;
        properties: any;
      }>
    ) => {
      if (
        state.presentationData &&
        state.presentationData.slides &&
        state.presentationData.slides[action.payload.slideIndex]
      ) {
        const slide = state.presentationData.slides[action.payload.slideIndex];
        const { itemIndex, properties } = action.payload;
        slide['properties'] = {
          ...slide.properties,
          [itemIndex]: properties
        };

      }
    },

    updateSlideIcon: (
      state,
      action: PayloadAction<{
        slideIndex: number;
        dataPath: string;
        iconUrl: string;
        query?: string;
      }>
    ) => {
      const slide = state.presentationData?.slides?.[action.payload.slideIndex];
      if (!slide?.content || !action.payload.dataPath) return;

      const { dataPath, iconUrl, query } = action.payload;
      const nav = navigateToParent(slide.content, dataPath);
      if (nav) {
        const target = getAtPath(nav.parent, nav.finalKey);
        const updatedValue = {
          ...(target && typeof target === 'object' ? target : {}),
          __icon_url__: iconUrl,
          __icon_query__: query || (target?.__icon_query__) || ''
        };
        setAtPath(nav.parent, nav.finalKey, updatedValue);
      }

      if (slide.icons && Array.isArray(slide.icons)) {
        const iconIndex = parseInt(dataPath.split('[')[1]?.split(']')[0]) || 0;
        if (slide.icons[iconIndex] !== undefined) {
          slide.icons[iconIndex] = iconUrl;
        }
      }
    },
    updateTheme: (state, action: PayloadAction<Theme | null>) => {
      if (state.presentationData) {
        state.presentationData['theme'] = action.payload;
      }
    },
  },

});

export const {
  setStreaming,
  setLoading,
  setLayoutLoading,
  setPresentationId,
  setSlidesRendered,
  setError,
  clearPresentationData,
  clearOutlines,
  deleteSlideOutline,
  setPresentationData,
  updateTitle,
  setOutlines,
  setSkeletonSlides,
  updateSkeletonLayouts,
  markSkeletonReady,
  // slides operations
  addSlide,
  updateSlide,
  deletePresentationSlide,
  updateSlideContent,
  updateSlideImage,
  updateImageProperties,
  updateSlideIcon,
  addNewSlide,
  updateTheme,
} = presentationGenerationSlice.actions;

export default presentationGenerationSlice.reducer;
