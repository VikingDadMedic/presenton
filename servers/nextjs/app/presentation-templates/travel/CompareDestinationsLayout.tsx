import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-compare-destinations'
export const layoutName = 'Compare Destinations'
export const layoutDescription = 'A side-by-side destination comparison slide with 2-3 cards, each featuring a destination image, name, star rating, price badge, and highlights list.'

const compareDestinationsSchema = z.object({
    title: z.string().min(3).max(50).default('Compare Destinations').meta({
        description: "Main heading for the comparison slide",
    }),
    destinations: z.array(z.object({
        name: z.string().min(2).max(25).meta({
            description: "Name of the destination",
        }),
        price: z.string().min(1).max(15).meta({
            description: "Starting price or price range",
        }),
        rating: z.number().min(1).max(5).meta({
            description: "Star rating from 1 to 5",
        }),
        highlights: z.array(z.string().min(3).max(50).meta({
            description: "A key highlight or feature of the destination",
        })).min(2).max(4).meta({
            description: "List of destination highlights",
        }),
        image: ImageSchema.meta({
            description: "Destination photo",
        }),
    })).min(2).max(3).default([
        {
            name: 'Santorini, Greece',
            price: 'From $1,899',
            rating: 5,
            highlights: ['Iconic sunset views', 'Volcanic beaches', 'Ancient ruins', 'Wine tasting tours'],
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?auto=format&fit=crop&w=1000&q=80',
                __image_prompt__: 'Santorini white buildings blue domes',
            },
        },
        {
            name: 'Kyoto, Japan',
            price: 'From $1,599',
            rating: 5,
            highlights: ['Historic temples', 'Cherry blossom season', 'Traditional tea houses', 'Bamboo forests'],
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1000&q=80',
                __image_prompt__: 'Kyoto traditional temple with garden',
            },
        },
        {
            name: 'Machu Picchu, Peru',
            price: 'From $2,199',
            rating: 4,
            highlights: ['Inca citadel trek', 'Mountain scenery', 'Cultural immersion'],
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1587595431973-160d0d94add1?auto=format&fit=crop&w=1000&q=80',
                __image_prompt__: 'Machu Picchu ancient ruins mountains',
            },
        },
    ]).meta({
        description: "List of destinations to compare",
    }),
})

export const Schema = compareDestinationsSchema

export type CompareDestinationsData = z.infer<typeof compareDestinationsSchema>

interface CompareDestinationsLayoutProps {
    data?: Partial<CompareDestinationsData>
}

const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
    <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
            <span
                key={i}
                className="text-[14px]"
                style={{ color: i < rating ? 'var(--primary-color, #f59e0b)' : 'var(--stroke, #d1d5db)' }}
            >
                ★
            </span>
        ))}
    </div>
)

const CompareDestinationsLayout: React.FC<CompareDestinationsLayoutProps> = ({ data: slideData }) => {
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
                                {(slideData as any)?.__companyName__ && <span className="text-sm sm:text-base font-semibold" style={{ color: 'var(--background-text, #111827)' }}>
                                    {(slideData as any)?.__companyName__ || 'Company Name'}
                                </span>}
                            </div>
                        </div>
                    </div>
                )}

                <div className="relative z-10 flex flex-col h-full px-8 sm:px-12 lg:px-16 pt-14 pb-8">
                    <h1
                        className="text-[36px] font-bold leading-tight mb-8 text-center"
                        style={{ color: 'var(--background-text, #111827)' }}
                    >
                        {slideData?.title || 'Compare Destinations'}
                    </h1>

                    <div className="flex flex-1 gap-6 min-h-0">
                        {destinations.map((dest, index) => (
                            <div
                                key={index}
                                className="flex-1 rounded-xl overflow-hidden flex flex-col border"
                                style={{ borderColor: 'var(--stroke, #e5e7eb)', backgroundColor: 'var(--card-color, #ffffff)' }}
                            >
                                <div className="relative h-[200px] flex-shrink-0">
                                    <img
                                        src={dest.image?.__image_url__ || ''}
                                        alt={dest.image?.__image_prompt__ || dest.name || ''}
                                        className="w-full h-full object-cover"
                                    />
                                    <div
                                        className="absolute top-3 right-3 px-3 py-1 rounded-full text-[12px] font-bold"
                                        style={{ backgroundColor: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                                    >
                                        {dest.price}
                                    </div>
                                </div>

                                <div className="flex flex-col flex-1 p-5">
                                    <h3
                                        className="text-[18px] font-bold mb-1.5"
                                        style={{ color: 'var(--background-text, #111827)' }}
                                    >
                                        {dest.name}
                                    </h3>

                                    <StarRating rating={dest.rating ?? 4} />

                                    <div className="mt-4 flex flex-col gap-2 flex-1">
                                        {dest.highlights?.map((hl, i) => (
                                            <div key={i} className="flex items-start gap-2">
                                                <span
                                                    className="text-[13px] mt-0.5 flex-shrink-0"
                                                    style={{ color: 'var(--primary-color, #2563eb)' }}
                                                >
                                                    •
                                                </span>
                                                <span
                                                    className="text-[13px] leading-snug"
                                                    style={{ color: 'var(--background-text, #374151)', fontFamily: 'var(--body-font-family, Poppins)' }}
                                                >
                                                    {hl}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    )
}

export default CompareDestinationsLayout
