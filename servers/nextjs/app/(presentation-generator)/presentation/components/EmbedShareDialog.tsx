"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink } from "lucide-react";
import { MotionIcon } from "motion-icons-react";
import { buildShowcasePublicTogglePayload } from "@/lib/showcase-mixpanel";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";

interface EmbedShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedUrl: string;
  iframeCode: string;
}

type ShareMode = "embed" | "showcase";

function getPresentationIdFromEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] === "embed" && segments[1]) {
      return segments[1];
    }
    return null;
  } catch {
    return null;
  }
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
          {copied ? <MotionIcon name="Check" entrance="zoomIn" animation="tada" size={14} color="#16a34a" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function withMode(url: string, mode: ShareMode): string {
  if (mode === "embed") return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}mode=showcase`;
}

function buildIframeCode(iframeCode: string, embedUrl: string, mode: ShareMode): string {
  if (mode === "embed") return iframeCode;
  // Replace the existing embedUrl inside the iframe code with the showcase URL.
  return iframeCode.replace(embedUrl, withMode(embedUrl, "showcase"));
}

export default function EmbedShareDialog({
  open,
  onOpenChange,
  embedUrl,
  iframeCode,
}: EmbedShareDialogProps) {
  const [mode, setMode] = useState<ShareMode>("embed");
  const [isPublic, setIsPublic] = useState(false);
  const [loadingVisibility, setLoadingVisibility] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);

  const activeUrl = useMemo(() => withMode(embedUrl, mode), [embedUrl, mode]);
  const activeIframe = useMemo(
    () => buildIframeCode(iframeCode, embedUrl, mode),
    [iframeCode, embedUrl, mode]
  );
  const presentationId = useMemo(
    () => getPresentationIdFromEmbedUrl(embedUrl),
    [embedUrl]
  );

  useEffect(() => {
    if (!open || mode !== "showcase" || !presentationId) return;
    let cancelled = false;
    (async () => {
      setLoadingVisibility(true);
      setVisibilityError(null);
      try {
        const res = await fetch(`/api/v1/ppt/presentation/${presentationId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Failed to fetch visibility (${res.status})`);
        const json = await res.json();
        if (!cancelled) {
          setIsPublic(Boolean(json?.is_public));
        }
      } catch (err) {
        if (!cancelled) {
          setVisibilityError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoadingVisibility(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, open, presentationId]);

  const updateVisibility = async (nextValue: boolean) => {
    if (!presentationId || savingVisibility) return;
    setSavingVisibility(true);
    setVisibilityError(null);
    try {
      const res = await fetch(
        `/api/v1/ppt/presentation/${presentationId}/visibility`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ is_public: nextValue }),
        }
      );
      if (!res.ok) {
        throw new Error(`Failed to update visibility (${res.status})`);
      }
      setIsPublic(nextValue);
      if (presentationId) {
        trackEvent(
          MixpanelEvent.Showcase_Public_Toggle,
          buildShowcasePublicTogglePayload({
            presentationId,
            isPublic: nextValue,
          })
        );
      }
    } catch (err) {
      setVisibilityError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingVisibility(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Share Presentation</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="flex items-center gap-1 p-1 rounded-md border border-border bg-muted/40 w-fit">
            <button
              type="button"
              onClick={() => setMode("embed")}
              className={`px-3 py-1.5 text-xs rounded-sm transition-colors ${
                mode === "embed"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Embed
            </button>
            <button
              type="button"
              onClick={() => setMode("showcase")}
              className={`px-3 py-1.5 text-xs rounded-sm transition-colors ${
                mode === "showcase"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Showcase
            </button>
          </div>

          <p className="text-xs text-muted-foreground -mt-2">
            {mode === "embed"
              ? "Linear viewer with arrow-key navigation. Best for embedding into your site."
              : "Self-led, looped, kiosk-style autoplay with larger controls. Best for sharing with clients."}
          </p>

          {mode === "showcase" && (
            <div className="rounded-md border border-border bg-muted/25 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-foreground">Make public</p>
                  <p className="text-[11px] text-muted-foreground">
                    Allow unauthenticated viewers to open this showcase link.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={isPublic ? "default" : "outline"}
                  size="sm"
                  disabled={loadingVisibility || savingVisibility || !presentationId}
                  onClick={() => updateVisibility(!isPublic)}
                >
                  {savingVisibility
                    ? "Saving..."
                    : loadingVisibility
                      ? "Loading..."
                      : isPublic
                        ? "On"
                        : "Off"}
                </Button>
              </div>
              {isPublic && (
                <p className="text-[11px] text-amber-600 dark:text-amber-300">
                  Anyone with the link can view this showcase.
                </p>
              )}
              {visibilityError && (
                <p className="text-[11px] text-red-600 dark:text-red-300">
                  {visibilityError}
                </p>
              )}
            </div>
          )}

          <CopyField label="Share URL" value={activeUrl} />
          <CopyField label="Embed Code" value={activeIframe} />

          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open(activeUrl, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-2" />
            Preview in new tab
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
