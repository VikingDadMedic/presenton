import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-memory-quote'
export const layoutName = 'Memory Quote'
export const layoutDescription = 'A recap-focused quote slide that highlights a traveler memory with supporting context and portrait.'

const memoryQuoteSchema = z.object({
    memory_title: z.string().min(3).max(60).default('The Moment We Still Talk About').meta({
        description: "Heading that frames the memory quote",
    }),
    quote: z.string().min(20).max(260).default('Watching the caldera glow at sunset felt unreal - it was the kind of evening we will remember for years.').meta({
        description: "The traveler memory quote in their own words",
    }),
    traveler_name: z.string().min(2).max(40).default('Jordan Lee').meta({
        description: "Traveler name attached to the memory quote",
    }),
    trip_context: z.string().min(3).max(70).default('Santorini Anniversary Escape').meta({
        description: "Trip or campaign context for the quote",
    }),
    memory_date: z.string().min(3).max(30).default('June 2025').meta({
        description: "When the memory happened",
    }),
    image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=80',
        __image_prompt__: 'Happy traveler smiling at sunset viewpoint',
    }).meta({
        description: "Portrait or candid image of the traveler",
    }),
})

export const Schema = memoryQuoteSchema

export type MemoryQuoteData = z.infer<typeof memoryQuoteSchema>

interface MemoryQuoteLayoutProps {
    data?: Partial<MemoryQuoteData>
}

const MemoryQuoteLayout: React.FC<MemoryQuoteLayoutProps> = ({ data: slideData }) => {
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

                <div className="relative z-10 h-full flex">
                    <div className="w-[42%] h-full relative">
                        <img
                            src={slideData?.image?.__image_url__ || ''}
                            alt={slideData?.image?.__image_prompt__ || slideData?.traveler_name || 'Traveler'}
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-black/5 to-transparent" />
                    </div>

                    <div className="w-[58%] h-full px-10 sm:px-12 lg:px-16 py-12 flex flex-col justify-center">
                        <div
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] mb-5 self-start"
                            style={{ background: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                        >
                            Recap Highlight
                        </div>

                        <h1
                            className="text-[36px] font-bold leading-tight mb-5"
                            style={{ color: 'var(--background-text, #111827)' }}
                        >
                            {slideData?.memory_title || 'The Moment We Still Talk About'}
                        </h1>

                        <blockquote
                            className="text-[24px] leading-relaxed italic mb-8"
                            style={{ color: 'var(--background-text, #1f2937)', fontFamily: 'var(--body-font-family, Poppins)' }}
                        >
                            &ldquo;{slideData?.quote || 'Watching the caldera glow at sunset felt unreal - it was the kind of evening we will remember for years.'}&rdquo;
                        </blockquote>

                        <div className="border-t pt-5" style={{ borderColor: 'var(--stroke, #e5e7eb)' }}>
                            <p
                                className="text-[18px] font-semibold"
                                style={{ color: 'var(--background-text, #111827)' }}
                            >
                                {slideData?.traveler_name || 'Jordan Lee'}
                            </p>
                            <p
                                className="text-[13px] mt-1"
                                style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}
                            >
                                {(slideData?.trip_context || 'Santorini Anniversary Escape')} - {slideData?.memory_date || 'June 2025'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default MemoryQuoteLayout
