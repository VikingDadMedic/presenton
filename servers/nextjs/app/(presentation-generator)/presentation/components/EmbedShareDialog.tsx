"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, ExternalLink } from "lucide-react";

interface EmbedShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedUrl: string;
  iframeCode: string;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-muted rounded-md px-3 py-2.5 break-all select-all border border-border">
          {value}
        </code>
        <Button
          variant="outline"
          size="icon"
          className="flex-shrink-0 h-9 w-9"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export default function EmbedShareDialog({
  open,
  onOpenChange,
  embedUrl,
  iframeCode,
}: EmbedShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Embed Presentation</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <CopyField label="Share URL" value={embedUrl} />
          <CopyField label="Embed Code" value={iframeCode} />

          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open(embedUrl, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-2" />
            Preview in new tab
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
