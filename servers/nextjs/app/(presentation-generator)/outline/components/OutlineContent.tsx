"use client";
import React, { useState, useEffect } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { OutlineItem } from "./OutlineItem";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { TextFlippingBoard } from "@/components/ui/text-flipping-board";

const STATUS_MESSAGES = [
    "CRAFTING YOUR STORY",
    "RESEARCHING DESTINATIONS",
    "BUILDING THE NARRATIVE",
    "DESIGNING SLIDE LAYOUTS",
    "SELECTING KEY HIGHLIGHTS",
];

interface OutlineContentProps {
    outlines: { content: string }[] | null;
    isLoading: boolean;
    isStreaming: boolean;
    activeSlideIndex: number | null;
    highestActiveIndex: number;
    onDragEnd: (event: any) => void;
    onAddSlide: () => void;
}

const OutlineContent: React.FC<OutlineContentProps> = ({
    outlines,
    isLoading,
    isStreaming,
    activeSlideIndex,
    highestActiveIndex,
    onDragEnd,
    onAddSlide
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const [messageIndex, setMessageIndex] = useState(0);

    useEffect(() => {
        if (!isLoading) return;
        const interval = setInterval(() => {
            setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [isLoading]);

    return (
        <div className="space-y-6 font-display">
            {isLoading && (!outlines || outlines.length === 0) && (
                <div className="flex flex-col items-center justify-center gap-6 py-12">
                    <div className="w-full max-w-md">
                        <TextFlippingBoard
                            text={STATUS_MESSAGES[messageIndex]}
                            duration={1.0}
                            className="mx-auto scale-75 sm:scale-90"
                        />
                    </div>
                    <p className="font-mono text-xs tracking-widest uppercase text-primary animate-pulse">
                        TripStory is working...
                    </p>
                </div>
            )}

            {isLoading && (
                <div className="space-y-4">
                    {[...Array(6)].map((_, index) => (
                        <div key={index} className="animate-pulse">
                            <div className="flex items-start space-x-3 p-4 border border-primary/10 rounded-lg bg-card">
                                <div className="w-6 h-6 bg-primary/10 rounded-md flex-shrink-0"></div>
                                <div className="flex-1 space-y-2">
                                    <div className="h-5 bg-primary/10 rounded w-3/4"></div>
                                    <div className="space-y-1">
                                        <div className="h-4 bg-primary/5 rounded w-full"></div>
                                        <div className="h-4 bg-primary/5 rounded w-5/6"></div>
                                        <div className="h-4 bg-primary/5 rounded w-4/6"></div>
                                    </div>
                                </div>
                                <div className="w-5 h-5 bg-primary/10 rounded flex-shrink-0"></div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {outlines && outlines.length > 0 && (
                <div className="bg-card p-7 relative z-20 rounded-xl min-h-[calc(100vh-200px)]">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={onDragEnd}
                    >
                        <SortableContext
                            items={outlines.map((_, index) => `slide-${index}`)}
                            strategy={verticalListSortingStrategy}
                        >
                            {outlines.map((item, index) => (
                                <OutlineItem
                                    key={`slide-${index}`}
                                    sortableId={`slide-${index}`}
                                    index={index + 1}
                                    slideOutline={item}
                                    isStreaming={isStreaming}
                                    isActiveStreaming={activeSlideIndex === index}
                                    isStableStreaming={highestActiveIndex >= 0 && index < highestActiveIndex}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>

                    <Button
                        variant="outline"
                        onClick={() => {
                            onAddSlide();
                        }}
                        disabled={isLoading || isStreaming}
                        className="w-full my-4 text-primary border-primary/20"
                    >
                        + Add Slide
                    </Button>
                </div>
            )}

            {!isStreaming && !isLoading && outlines && outlines.length === 0 && (
                <div className="text-center py-12 bg-card rounded-lg border-2 border-dashed border-border">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">No outlines available</p>
                    <Button
                        variant="outline"
                        onClick={() => {
                            onAddSlide();
                        }}
                        className="text-primary border-primary/20"
                    >
                        + Add First Slide
                    </Button>
                </div>
            )}
        </div>
    );
};

export default OutlineContent;
