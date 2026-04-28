import React from "react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "../types/index";
import { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import { ChevronRight } from "lucide-react";

interface GenerateButtonProps {
  loadingState: LoadingState;
  streamState: { isStreaming: boolean; isLoading: boolean };
  selectedTemplate: TemplateLayoutsWithSettings | string | null;
  onSubmit: () => void;
}

const GenerateButton: React.FC<GenerateButtonProps> = ({
  loadingState,
  streamState,
  selectedTemplate,
  onSubmit,
}) => {
  const isDisabled =
    loadingState.isLoading || streamState.isLoading || streamState.isStreaming;

  const getButtonText = () => {
    if (loadingState.isLoading) return loadingState.message;
    if (streamState.isLoading || streamState.isStreaming) return "Loading...";
    if (!selectedTemplate) return "Select a Template";
    return "Generate Presentation";
  };

  return (
    <Button
      disabled={isDisabled}
      onClick={() => {
        onSubmit();
      }}
      size="lg"
      className="w-full font-display font-semibold"
    >
      {getButtonText()}
      <ChevronRight className="w-4 h-4" />
    </Button>
  );
};

export default GenerateButton;
