import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-series-cover'
export const layoutName = 'Series Cover'
export const layoutDescription = 'A series opener for multi-destination travel decks with a strong headline and destination chips.'

const seriesCoverSchema = z.object({
    series_label: z.string().min(3).max(30).default('Trip Series').meta({
        description: "Short label shown above the title",
    }),
    title: z.string().min(3).max(70).default('5 Caribbean Islands, One Perfect Match').meta({
        description: "Main headline for the series deck",
    }),
    subtitle: z.string().min(10).max(140).default('A side-by-side journey through beaches, food scenes, flight access, and best-fit traveler vibes.').meta({
        description: "Supporting statement that frames how destinations will be compared",
    }),
    decision_prompt: z.string().min(8).max(100).default('Compare vibe, value, and logistics before you choose your next escape.').meta({
        description: "Decision-focused prompt shown near the bottom",
    }),
    destinations: z.array(z.string().min(2).max(30)).min(3).max(6).default([
        'Barbados',
        'St. Lucia',
        'Aruba',
        'Curacao',
        'Antigua',
    ]).meta({
        description: "Destination names included in the series",
    }),
    image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1280&q=80',
        __image_prompt__: 'Caribbean beach panorama with turquoise ocean and palm trees',
    }).meta({
        description: "Hero background image representing the destination series",
    }),
})

export const Schema = seriesCoverSchema

export type SeriesCoverData = z.infer<typeof seriesCoverSchema>

interface SeriesCoverLayoutProps {
    data?: Partial<SeriesCoverData>
}

const SeriesCoverLayout: React.FC<SeriesCoverLayoutProps> = ({ data: slideData }) => {
    const destinations = slideData?.destinations || []

    return (
        <>
            <TravelFonts />

            <div
                className="w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video relative z-20 mx-auto overflow-hidden"
                style={{
                    background: "var(--background-color,#ffffff)",
                    fontFamily: "var(--heading-font-family,Poppins)",
                }}
            >
                {((slideData as any)?.__companyName__ || (slideData as any)?._logo_url__) && (
                    <div className="absolute top-0 left-0 right-0 px-8 sm:px-12 lg:px-20 pt-4 z-30">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                                {(slideData as any)?._logo_url__ && <img src={(slideData as any)?._logo_url__} alt="logo" className="w-6 h-6" />}
                                {(slideData as any)?.__companyName__ && <span className="text-sm sm:text-base font-semibold" style={{ color: 'var(--primary-text, #ffffff)' }}>
                                    {(slideData as any)?.__companyName__ || 'Company Name'}
                                </span>}
                            </div>
                        </div>
                    </div>
                )}

                <div className="absolute inset-0">
                    <img
                        src={slideData?.image?.__image_url__ || ''}
                        alt={slideData?.image?.__image_prompt__ || 'Travel series'}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/35" />
                </div>

                <div className="relative z-10 h-full px-10 sm:px-14 lg:px-20 py-14 flex flex-col justify-between">
                    <div>
                        <span
                            className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em]"
                            style={{ background: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                        >
                            {slideData?.series_label || 'Trip Series'}
                        </span>

                        <h1
                            className="text-[52px] max-w-[900px] font-bold leading-tight mt-5"
                            style={{ color: 'var(--primary-text, #ffffff)' }}
                        >
                            {slideData?.title || '5 Caribbean Islands, One Perfect Match'}
                        </h1>

                        <p
                            className="text-[19px] leading-relaxed max-w-[760px] mt-4"
                            style={{ color: 'rgba(255,255,255,0.9)', fontFamily: 'var(--body-font-family, Poppins)' }}
                        >
                            {slideData?.subtitle || 'A side-by-side journey through beaches, food scenes, flight access, and best-fit traveler vibes.'}
                        </p>
                    </div>

                    <div className="space-y-5">
                        <div className="flex flex-wrap gap-2.5">
                            {destinations.map((destination, index) => (
                                <span
                                    key={`${destination}-${index}`}
                                    className="inline-flex items-center px-3.5 py-1.5 rounded-full text-[12px] font-semibold"
                                    style={{ background: 'rgba(255,255,255,0.16)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)' }}
                                >
                                    {destination}
                                </span>
                            ))}
                        </div>

                        <p
                            className="text-[16px] font-medium"
                            style={{ color: 'rgba(255,255,255,0.92)', fontFamily: 'var(--body-font-family, Poppins)' }}
                        >
                            {slideData?.decision_prompt || 'Compare vibe, value, and logistics before you choose your next escape.'}
                        </p>
                    </div>
                </div>
            </div>
        </>
    )
}

export default SeriesCoverLayout
