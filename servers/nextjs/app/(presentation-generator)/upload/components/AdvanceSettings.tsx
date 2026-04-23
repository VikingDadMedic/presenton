import ToolTip from '@/components/ToolTip';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, SlidersHorizontal, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { PresentationConfig, ToneType, VerbosityType } from '../type';

interface ConfigurationSelectsProps {
    config: PresentationConfig;
    onConfigChange: (key: keyof PresentationConfig, value: any) => void;
}

const toggleClassName =
    'h-[22px] w-[36px] border-0 bg-[#D8D8DD] data-[state=checked]:bg-primary ';

const AdvanceSettings = ({ config, onConfigChange }: ConfigurationSelectsProps) => {
    const [openAdvanced, setOpenAdvanced] = useState(false);

    const [advancedDraft, setAdvancedDraft] = useState({
        tone: config.tone,
        verbosity: config.verbosity,
        instructions: config.instructions,
        includeTableOfContents: config.includeTableOfContents,
        includeTitleSlide: config.includeTitleSlide,
        webSearch: config.webSearch,
    });

    const syncDraftFromConfig = () => {
        setAdvancedDraft({
            tone: config.tone,
            verbosity: config.verbosity,
            instructions: config.instructions,
            includeTableOfContents: config.includeTableOfContents,
            includeTitleSlide: config.includeTitleSlide,
            webSearch: config.webSearch,
        });
    };

    const handleOpenAdvanced = () => {
        syncDraftFromConfig();
        setOpenAdvanced(true);
    };

    const handleCloseAdvanced = () => {
        setOpenAdvanced(false);
    };

    const handleSaveAdvanced = () => {
        onConfigChange('tone', advancedDraft.tone);
        onConfigChange('verbosity', advancedDraft.verbosity);
        onConfigChange('instructions', advancedDraft.instructions);
        onConfigChange('includeTableOfContents', advancedDraft.includeTableOfContents);
        onConfigChange('includeTitleSlide', advancedDraft.includeTitleSlide);
        onConfigChange('webSearch', advancedDraft.webSearch);
        setOpenAdvanced(false);
    };

    useEffect(() => {
        if (!openAdvanced) {
            return;
        }

        const previousOverflow = document.body.style.overflow;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                handleCloseAdvanced();
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [openAdvanced]);

    return (
        <>
            <div className="ml-auto">
                <ToolTip content="Advanced settings">
                    <button
                        aria-label="Advanced settings"
                        title="Advanced settings"
                        type="button"
                        onClick={handleOpenAdvanced}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                        data-testid="advanced-settings-button"
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </ToolTip>
            </div>

            {openAdvanced && (
                <div
                    className="fixed inset-0 z-[70] bg-black/35 flex items-center justify-center"
                    onClick={handleCloseAdvanced}
                    role="presentation"
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Advanced settings"
                        className="relative mx-auto mt-[108px] w-[calc(100vw-2rem)] max-w-[640px] overflow-visible"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={handleCloseAdvanced}
                            aria-label="Close advanced settings"
                            className="absolute -top-[62px] right-2 flex h-[50px] w-[50px] items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition hover:bg-accent"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>

                        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,0.20)]">
                            <div className="flex items-start justify-between gap-4 bg-background px-6 py-[22px] ">
                                <div>
                                    <h2 className="font-display text-lg font-semibold leading-none text-foreground">
                                        Advanced Settings
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">Adjust Presentation Behavior</p>
                                </div>

                                <Button
                                    type="button"
                                    onClick={handleSaveAdvanced}
                                    className="rounded-md px-[28px] py-[10px] bg-primary text-primary-foreground font-display text-xs font-semibold shadow-none hover:bg-primary/90"
                                >
                                    Save
                                </Button>
                            </div>

                            <div className="bg-muted px-6  py-5">
                                <div className="flex items-start gap-2">
                                    <Pencil className="mt-[3px] h-3.5 w-3.5 text-foreground" />
                                    <div className="w-full">
                                        <label
                                            htmlFor="advanced-instructions"
                                            className="block font-display text-sm font-semibold leading-none text-foreground"
                                        >
                                            Write instructions
                                        </label>
                                        <Textarea
                                            id="advanced-instructions"
                                            value={advancedDraft.instructions}
                                            autoFocus={true}
                                            rows={2}
                                            onChange={(event) =>
                                                setAdvancedDraft((prev) => ({ ...prev, instructions: event.target.value }))
                                            }
                                            placeholder="Guide the AI: define audience, tone, key points, or constraints."
                                            className="mt-1 min-h-[64px] resize-none border-0 bg-transparent p-0 text-sm leading-[1.3] text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 px-6 pb-5 pt-3.5 ">
                                <div className="flex items-center justify-between gap-3">
                                    <label className="font-display text-sm font-semibold leading-none text-foreground">Tone</label>
                                    <Select
                                        value={advancedDraft.tone}
                                        onValueChange={(value) =>
                                            setAdvancedDraft((prev) => ({ ...prev, tone: value as ToneType }))
                                        }

                                    >
                                        <SelectTrigger className="p-2.5 w-[120px] rounded-xl border-border bg-background font-display text-sm font-medium capitalize text-foreground shadow-none focus:ring-0 focus-visible:ring-0">
                                            <SelectValue placeholder="Select tone" />
                                        </SelectTrigger>
                                        <SelectContent className="z-[120] font-display">
                                            {Object.values(ToneType).map((tone) => (
                                                <SelectItem key={tone} value={tone} className="text-sm font-medium capitalize">
                                                    {tone}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <label className="font-display text-sm font-semibold leading-none text-foreground">Verbosity</label>
                                    <Select
                                        value={advancedDraft.verbosity}
                                        onValueChange={(value) =>
                                            setAdvancedDraft((prev) => ({ ...prev, verbosity: value as VerbosityType }))
                                        }
                                    >
                                        <SelectTrigger className="p-2.5 w-[120px] rounded-xl border-border bg-background font-display text-sm font-medium capitalize text-foreground shadow-none focus:ring-0 focus-visible:ring-0">
                                            <SelectValue placeholder="Select verbosity" />
                                        </SelectTrigger>
                                        <SelectContent className="z-[120] font-display">
                                            {Object.values(VerbosityType).map((verbosity) => (
                                                <SelectItem key={verbosity} value={verbosity} className="text-sm font-medium capitalize">
                                                    {verbosity}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <label className="font-display text-sm font-semibold leading-none text-foreground">
                                        Include Table of Content
                                    </label>
                                    <Switch
                                        checked={advancedDraft.includeTableOfContents}
                                        onCheckedChange={(checked) =>
                                            setAdvancedDraft((prev) => ({ ...prev, includeTableOfContents: checked }))
                                        }
                                        className={toggleClassName}
                                    />
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <label className="font-display text-sm font-semibold leading-none text-foreground">Title Slide</label>
                                    <Switch
                                        checked={advancedDraft.includeTitleSlide}
                                        onCheckedChange={(checked) =>
                                            setAdvancedDraft((prev) => ({ ...prev, includeTitleSlide: checked }))
                                        }
                                        className={toggleClassName}
                                    />
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <label className="font-display text-sm font-semibold leading-none text-foreground">Web Search</label>
                                    <Switch
                                        checked={advancedDraft.webSearch}
                                        onCheckedChange={(checked) =>
                                            setAdvancedDraft((prev) => ({ ...prev, webSearch: checked }))
                                        }
                                        className={toggleClassName}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AdvanceSettings;
