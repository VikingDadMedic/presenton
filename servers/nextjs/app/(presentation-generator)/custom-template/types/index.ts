import type React from "react";

// ================== Core Types ==================

export interface SlideData {
  slide_number: number;
  screenshot_url: string;
  xml_content?: string;
  normalized_fonts?: string[];
  markdown_content?: string;
}

export interface UploadedFont {
  fontName: string;
  fontUrl: string;
  fontPath: string;
  file: File; // Original file for re-upload
}

export interface FontItem {
  name: string;
  url: string | null;
}

export interface FontData {
  available_fonts: FontItem[];
  unavailable_fonts: FontItem[];
}

// ================== Template Creation Flow Types ==================

export type TemplateCreationStep =
  | 'file-upload'
  | 'font-check'
  | 'font-upload'
  | 'slides-preview'
  | 'template-creation'
  | 'completed';

export interface FontUploadPreviewResponse {
  slide_image_urls: string[];
  pptx_url: string;
  modified_pptx_url: string;
  fonts: {
    [key: string]: string;
  };
  total_original_slides: number;
  processed_slide_count: number;
}

export interface TemplateReadinessResponse {
  ready: boolean;
  provider?: string | null;
  model?: string | null;
  reason?: string | null;
}

export interface FontInfo {
  name: string;
  url?: string;
  path?: string;
}

export interface TemplateCreationInitResponse {
  id: string;
  total_slides: number;
}

export interface SlideLayoutResponse {
  slide_index: number;
  react_component: string;
  layout_id: string;
  layout_name: string;
  layout_description?: string;
}

export interface TemplateCreationState {
  step: TemplateCreationStep;
  isLoading: boolean;
  error: string | null;

  // Font check data
  fontsData: FontData | null;

  // Font upload & preview data
  previewData: FontUploadPreviewResponse | null;

  // Template creation data
  templateId: string | null;
  totalSlides: number;

  // Slide layouts
  slideLayouts: SlideLayoutResponse[];
  currentSlideIndex: number;
}

// ================== Processed Slide Types ==================

export interface ProcessedSlide extends SlideData {
  react?: string;
  uploaded_fonts?: string[];
  processing?: boolean;
  processed?: boolean;
  error?: string;
  modified?: boolean;
  layout_id?: string;
  layout_name?: string;
  layout_description?: string;
}

// ================== Component Props Types ==================

export interface EachSlideProps {
  slide: ProcessedSlide;
  index: number;
  retrySlide: (index: number) => void;
  setSlides: React.Dispatch<React.SetStateAction<ProcessedSlide[]>>;
  onSlideUpdate?: (updatedSlideData: any) => void;
  isProcessing: boolean;
  onOpenSchemaEditor?: (index: number | null) => void;
  isSchemaEditorOpen?: boolean;
  schemaPreviewData?: Record<string, any> | null;  // Preview data from schema editor AI fill
  onClearSchemaPreview?: () => void;  // Callback to clear schema preview data in parent
}

export interface FontManagerProps {
  fontsData: FontData;
  uploadedFonts: UploadedFont[];
  uploadFont: (fontName: string, file: File) => string | null;
  removeFont: (fontName: string) => void;
  onContinue: () => void;
  isUploading?: boolean;
}

export interface SlidePreviewSectionProps {
  previewData: FontUploadPreviewResponse;
  onInitTemplate: () => void;
  isLoading: boolean;
}

export interface TemplateCreationProgressProps {
  currentStep: TemplateCreationStep;
  totalSlides: number;
  processedSlides: number;
}

export interface DrawingCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  slideDisplayRef: React.RefObject<HTMLDivElement | null>;
  strokeWidth: number;
  strokeColor: string;
  eraserMode: boolean;
  isDrawing: boolean;
  canvasDimensions: { width: number; height: number };
  onStrokeWidthChange: (width: number) => void;
  onStrokeColorChange: (color: string) => void;
  onEraserModeChange: (isEraser: boolean) => void;
  onClearCanvas: () => void;
}


export interface SlideActionsProps {
  slide: ProcessedSlide;
  index: number;
  isProcessing: boolean;
  isEditMode: boolean;
  isHtmlEditMode: boolean;
  onEditClick: () => void;
  onHtmlEditClick: () => void;
  onRetry: () => void;
  onDelete: () => void;
}

export interface SlideContentDisplayProps {
  slide: ProcessedSlide;
  isEditMode: boolean;
  isHtmlEditMode: boolean;
  slideContentRef: React.RefObject<HTMLDivElement | null>;
  slideDisplayRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasDimensions: { width: number; height: number };
  strokeWidth: number;
  strokeColor: string;
  eraserMode: boolean;
  isDrawing: boolean;
  didYourDraw: boolean;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  retrySlide: (slideNumber: number) => void;
}

export interface HtmlEditorProps {
  slide: ProcessedSlide;
  isHtmlEditMode: boolean;
  onSave: (html: string) => void;
  onCancel: () => void;
}
