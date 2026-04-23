"use client";

import React, { useState, useEffect } from 'react';
import { TextFlippingBoard } from '@/components/ui/text-flipping-board';

const TIPS = [
    "SELECTING PERFECT LAYOUTS",
    "GENERATING VISUAL CONTENT",
    "APPLYING YOUR BRAND THEME",
    "FETCHING DESTINATION IMAGES",
    "ALMOST READY TO PRESENT",
];

const LoadingState = () => {
    const [currentTipIndex, setCurrentTipIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mx-auto w-[560px] max-w-[90vw] flex flex-col items-center justify-center p-8">
            <div className="w-full bg-card rounded-xl border border-border shadow-lg">
                <div className="p-8 flex flex-col items-center gap-6">
                    <div
                        className="presentation-loader-dots shrink-0"
                        role="status"
                        aria-label="Loading"
                    />

                    <h2 className="text-xl font-display text-foreground tracking-wide">
                        Creating Your Story
                    </h2>

                    <div className="w-full max-w-md">
                        <TextFlippingBoard
                            text={TIPS[currentTipIndex]}
                            duration={0.9}
                            className="mx-auto scale-[0.6] sm:scale-75"
                        />
                    </div>

                    <p className="font-mono text-[10px] tracking-widest uppercase text-primary animate-pulse">
                        TripStory is working
                    </p>

                    <div className="w-full max-w-md">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full animate-progress" />
                        </div>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .presentation-loader-dots {
                    width: 40px;
                    aspect-ratio: 1;
                    --_c: no-repeat radial-gradient(
                        farthest-side,
                        var(--primary) 92%,
                        #0000
                    );
                    background:
                        var(--_c) top,
                        var(--_c) left,
                        var(--_c) right,
                        var(--_c) bottom;
                    background-size: 10px 10px;
                    animation: presentation-loader-l7 1s infinite;
                }
                @keyframes presentation-loader-l7 {
                    to {
                        transform: rotate(0.5turn);
                    }
                }
            `}</style>
        </div>
    );
};

export default LoadingState;
