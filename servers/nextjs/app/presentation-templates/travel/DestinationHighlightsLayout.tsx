import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-destination-highlights'
export const layoutName = 'Destination Highlights'
export const layoutDescription = 'A grid-based slide showcasing 3 to 6 destination highlights, each with an image, title, and short description. Ideal for featuring top attractions or experiences.'

const highlightSchema = z.object({
    title: z.string().min(2).max(30).meta({
        description: "Name of the highlight or attraction",
    }),
    description: z.string().min(5).max(80).meta({
        description: "Short description of what makes this highlight special",
    }),
    image: ImageSchema.meta({ description: "Highlight image" }),
})

const destinationHighlightsSchema = z.object({
    title: z.string().min(3).max(50).default('Top Experiences in Bali').meta({
        description: "Main heading for the highlights section",
    }),
    description: z.string().min(5).max(120).default('From ancient temples to pristine beaches, Bali offers unforgettable moments at every turn.').meta({
        description: "Introductory description below the title",
    }),
    highlights: z.array(highlightSchema).min(3).max(6).default([
        {
            title: 'Ubud Rice Terraces',
            description: 'Walk through lush green terraces carved into hillsides over centuries.',
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=600&q=80',
                __image_prompt__: 'Tegallalang rice terraces in Ubud Bali with palm trees'
            }
        },
        {
            title: 'Uluwatu Temple',
            description: 'A cliffside temple perched above crashing waves with stunning ocean views.',
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=600&q=80',
                __image_prompt__: 'Uluwatu temple on cliff edge Bali at golden hour'
            }
        },
        {
            title: 'Nusa Penida Beaches',
            description: 'Crystal-clear waters and dramatic limestone cliffs on a secluded island.',
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80',
                __image_prompt__: 'Kelingking beach Nusa Penida turquoise water aerial view'
            }
        },
    ]).meta({
        description: "List of destination highlights with images and descriptions",
    }),
})

export const Schema = destinationHighlightsSchema

export type DestinationHighlightsData = z.infer<typeof destinationHighlightsSchema>

interface DestinationHighlightsLayoutProps {
    data?: Partial<DestinationHighlightsData>
}

const DestinationHighlightsLayout: React.FC<DestinationHighlightsLayoutProps> = ({ data: slideData }) => {
    const highlights = slideData?.highlights || []

    const getGridCols = (count: number) => {
        if (count <= 3) return 'grid-cols-3'
        if (count === 4) return 'grid-cols-2 lg:grid-cols-4'
        return 'grid-cols-3'
    }

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

                {/* Decorative Element */}
                <div className="absolute top-0 right-0 w-64 h-64 opacity-10 overflow-hidden">
                    <svg className="w-full h-full" viewBox="0 0 200 200" fill="none">
                        <circle cx="150" cy="50" r="120" fill="var(--primary-color,#2563eb)" opacity="0.3" />
                    </svg>
                </div>

                {/* Main Content */}
                <div className="relative z-10 flex flex-col h-full px-8 sm:px-12 lg:px-20 pt-14 pb-8">
                    {/* Header */}
                    <div className="mb-6 text-center">
                        <h1
                            className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3"
                            style={{ color: 'var(--background-text,#111827)' }}
                        >
                            {slideData?.title || 'Top Experiences in Bali'}
                        </h1>
                        <div className="w-16 h-1 mx-auto mb-3" style={{ background: 'var(--primary-color,#2563eb)' }} />
                        <p
                            className="text-sm sm:text-base max-w-[600px] mx-auto"
                            style={{ color: 'var(--background-text,#4b5563)', fontFamily: 'var(--body-font-family,Poppins)' }}
                        >
                            {slideData?.description || 'From ancient temples to pristine beaches, Bali offers unforgettable moments at every turn.'}
                        </p>
                    </div>

                    {/* Highlights Grid */}
                    <div className={`grid ${getGridCols(highlights.length)} gap-5 flex-1`}>
                        {highlights.map((highlight, index) => (
                            <div
                                key={index}
                                className="rounded-xl overflow-hidden shadow-md flex flex-col"
                                style={{ background: 'var(--card-color,#f9fafb)', border: '1px solid var(--stroke,#e5e7eb)' }}
                            >
                                <div className="h-[55%] overflow-hidden">
                                    <img
                                        src={highlight.image?.__image_url__ || ''}
                                        alt={highlight.image?.__image_prompt__ || highlight.title}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="p-4 flex-1 flex flex-col justify-center">
                                    <h3
                                        className="text-base sm:text-lg font-semibold mb-1"
                                        style={{ color: 'var(--background-text,#111827)' }}
                                    >
                                        {highlight.title}
                                    </h3>
                                    <p
                                        className="text-xs sm:text-sm leading-relaxed"
                                        style={{ color: 'var(--background-text,#4b5563)', fontFamily: 'var(--body-font-family,Poppins)' }}
                                    >
                                        {highlight.description}
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

export default DestinationHighlightsLayout
