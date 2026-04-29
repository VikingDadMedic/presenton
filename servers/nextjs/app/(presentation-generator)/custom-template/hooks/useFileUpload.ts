import { useState, useCallback } from "react";
import { toast } from "sonner";

const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024;
const ACCEPTED_POWERPOINT_EXTENSIONS = [".ppt", ".pptx", ".pptm", ".odp"];

export const useFileUpload = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const validateAndSetFile = useCallback((file: File | null) => {
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isPowerPoint = ACCEPTED_POWERPOINT_EXTENSIONS.some((extension) =>
      lowerName.endsWith(extension)
    );
    if (!isPowerPoint) {
      toast.error("Please select a PowerPoint file (.ppt, .pptx, .pptm, .odp)");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File size must be less than 250MB");
      return;
    }

    setSelectedFile(file);
  }, []);

  const handleFileSelect = useCallback(
    (input: React.ChangeEvent<HTMLInputElement> | File) => {
      const file =
        input instanceof File ? input : input.target.files?.[0] ?? null;
      validateAndSetFile(file);
    },
    [validateAndSetFile]
  );

  const removeFile = useCallback(() => {
    setSelectedFile(null);
  }, []);

  return {
    selectedFile,
    handleFileSelect,
    removeFile,
  };
}; 