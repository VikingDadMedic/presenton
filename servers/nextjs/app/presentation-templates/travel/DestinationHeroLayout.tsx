import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-destination-hero'
export const layoutName = 'Destination Hero'
export const layoutDescription = 'A full-bleed hero slide featuring a destination background image with a dark overlay, bold title, tagline, and a country badge anchored at the bottom.'

const destinationHeroSchema = z.object({
    title: z.string().min(3).max(40).default('Discover Santorini').meta({
        description: "Destination name or headline displayed prominently over the hero image",
    }),
    tagline: z.string().min(5).max(80).default('Sun-kissed cliffs, azure waters, and timeless charm await you on this iconic Greek island.').meta({
        description: "Short inspirational tagline beneath the title",
    }),
    country: z.string().min(2).max(30).default('Greece').meta({
        description: "Country or region badge displayed at the bottom of the slide",
    }),
    image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1280&q=80',
        __image_prompt__: 'Santorini white buildings blue domes overlooking the Aegean Sea at sunset'
    }).meta({
        description: "Full-bleed background image of the travel destination",
    }),
})

export const Schema = destinationHeroSchema

export type DestinationHeroData = z.infer<typeof destinationHeroSchema>

interface DestinationHeroLayoutProps {
    data?: Partial<DestinationHeroData>
}

const DestinationHeroLayout: React.FC<DestinationHeroLayoutProps> = ({ data: slideData }) => {
    return (
        <>
            <TravelFonts />

            <div
                className="w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video relative z-20 mx-auto overflow-hidden"
                style={{
                    background: "var(--background-color,#ffffff)",
                    fontFamily: "var(--heading-font-family,Poppins)"
                }}
            >
                {((slideData as any)?.__companyName__ || (slideData as any)?._logo_url__) && (
                    <div className="absolute top-0 left-0 right-0 px-8 sm:px-12 lg:px-20 pt-4 z-30">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                                {(slideData as any)?._logo_url__ && <img src={(slideData as any)?._logo_url__} alt="logo" className="w-6 h-6" />}
                                {(slideData as any)?.__companyName__ && <span className="text-sm sm:text-base font-semibold" style={{ color: 'var(--background-text, #111827)' }}>
                                    {(slideData as any)?.__companyName__ || 'Company Name'}
                                </span>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Background Image */}
                <div className="absolute inset-0">
                    <img
                        src={slideData?.image?.__image_url__ || ''}
                        alt={slideData?.image?.__image_prompt__ || 'Destination'}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-end h-full px-12 sm:px-16 lg:px-24 pb-16">
                    <h1
                        className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight mb-4"
                        style={{ color: 'var(--primary-text, #ffffff)' }}
                    >
                        {slideData?.title || 'Discover Santorini'}
                    </h1>

                    <p
                        className="text-lg sm:text-xl lg:text-2xl max-w-[700px] leading-relaxed mb-8"
                        style={{ color: 'var(--primary-text, #ffffff)', opacity: 0.85, fontFamily: 'var(--body-font-family,Poppins)' }}
                    >
                        {slideData?.tagline || 'Sun-kissed cliffs, azure waters, and timeless charm await you on this iconic Greek island.'}
                    </p>

                    {/* Country Badge */}
                    <div className="flex items-center">
                        <span
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold tracking-wide uppercase"
                            style={{ background: 'var(--primary-color,#2563eb)', color: 'var(--primary-text,#ffffff)' }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                                <circle cx="12" cy="10" r="3" />
                            </svg>
                            {slideData?.country || 'Greece'}
                        </span>
                    </div>
                </div>
            </div>
        </>
    )
}

export default DestinationHeroLayout
