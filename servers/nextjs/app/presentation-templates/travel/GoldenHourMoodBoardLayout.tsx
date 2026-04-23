import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-golden-hour'
export const layoutName = 'Golden Hour Mood Board'
export const layoutDescription = 'A curated grid of time-of-day destination images — sunrise, golden hour, blue hour, after dark — with evocative mood text overlays. Sells the feeling of being there.'

const goldenHourSchema = z.object({
    title: z.string().min(3).max(50).default('A Day in Light').meta({
        description: "Main heading for the mood board slide",
    }),
    destination: z.string().min(2).max(30).default('Santorini').meta({
        description: "Destination name displayed as a subtitle",
    }),
    description: z.string().min(10).max(120).default('From the first blush of dawn to the last shimmer of starlight, every hour paints a new masterpiece.').meta({
        description: "Brief evocative description of the destination across times of day",
    }),
    time_slots: z.array(z.object({
        time_label: z.string().min(3).max(25).meta({
            description: "Time of day label such as Sunrise, Golden Hour, Blue Hour, After Dark",
        }),
        mood_text: z.string().min(10).max(80).meta({
            description: "Evocative description of the destination at this time of day",
        }),
        image: ImageSchema.meta({
            description: "Atmospheric photo of the destination at this time of day",
        }),
    })).min(3).max(5).default([
        {
            time_label: 'Sunrise',
            mood_text: 'The caldera glows pink as fishing boats slip silently into the harbour.',
            image: { __image_url__: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=800&q=80', __image_prompt__: 'Santorini sunrise pink sky over caldera' },
        },
        {
            time_label: 'Golden Hour',
            mood_text: 'Whitewashed walls turn to honey as the sun dips toward the Aegean.',
            image: { __image_url__: 'https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?auto=format&fit=crop&w=800&q=80', __image_prompt__: 'Santorini golden hour white buildings warm light' },
        },
        {
            time_label: 'Blue Hour',
            mood_text: 'Blue domes mirror the twilight sky in a moment of perfect stillness.',
            image: { __image_url__: 'https://images.unsplash.com/photo-1504512485720-7d83a16ee930?auto=format&fit=crop&w=800&q=80', __image_prompt__: 'Santorini blue hour domes twilight' },
        },
        {
            time_label: 'After Dark',
            mood_text: 'Candlelit terraces and distant laughter drift across the warm night air.',
            image: { __image_url__: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', __image_prompt__: 'Santorini night lights romantic terraces' },
        },
    ]).meta({
        description: "Time-of-day image cards with atmospheric descriptions",
    }),
})

export const Schema = goldenHourSchema

export type GoldenHourData = z.infer<typeof goldenHourSchema>

interface GoldenHourMoodBoardLayoutProps {
    data?: Partial<GoldenHourData>
}

const GoldenHourMoodBoardLayout: React.FC<GoldenHourMoodBoardLayoutProps> = ({ data: slideData }) => {
    const slots = slideData?.time_slots || []

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
                                {(slideData as any)?.__companyName__ && <span className="text-sm sm:text-base font-semibold" style={{ color: 'var(--background-text, #111827)' }}>
                                    {(slideData as any)?.__companyName__ || 'Company Name'}
                                </span>}
                            </div>
                        </div>
                    </div>
                )}

                <div className="relative z-10 flex flex-col h-full px-8 sm:px-12 lg:px-16 pt-14 pb-6">
                    <div className="mb-4">
                        <h1
                            className="text-[36px] font-bold leading-tight"
                            style={{ color: 'var(--background-text, #111827)' }}
                        >
                            {slideData?.title || 'A Day in Light'}
                        </h1>
                        <div className="flex items-center gap-3 mt-1">
                            <span
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold uppercase tracking-wide"
                                style={{ background: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                                </svg>
                                {slideData?.destination || 'Santorini'}
                            </span>
                            <p
                                className="text-[13px] leading-relaxed max-w-[500px]"
                                style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}
                            >
                                {slideData?.description || 'From the first blush of dawn to the last shimmer of starlight, every hour paints a new masterpiece.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-1 gap-3 min-h-0">
                        {slots.map((slot, index) => (
                            <div
                                key={index}
                                className="flex-1 relative rounded-xl overflow-hidden"
                            >
                                <img
                                    src={slot.image?.__image_url__ || ''}
                                    alt={slot.image?.__image_prompt__ || slot.time_label || ''}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

                                <div className="absolute bottom-0 left-0 right-0 p-4">
                                    <span
                                        className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2"
                                        style={{ background: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                                    >
                                        {slot.time_label}
                                    </span>
                                    <p
                                        className="text-[13px] leading-snug italic"
                                        style={{ color: '#ffffff', fontFamily: 'var(--body-font-family, Poppins)' }}
                                    >
                                        {slot.mood_text}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    )
}

export default GoldenHourMoodBoardLayout
