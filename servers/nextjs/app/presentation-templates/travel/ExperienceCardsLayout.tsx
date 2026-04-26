import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-experience-cards'
export const layoutName = 'Experience Cards'
export const layoutDescription = 'A bookable experiences grid with product photos, star ratings, pricing, duration, cancellation badges, and booking links. Powered by Viator.'

const experienceCardsSchema = z.object({
    title: z.string().min(3).max(50).default('Top Experiences').meta({
        description: "Main heading for the experience cards slide",
    }),
    description: z.string().min(10).max(120).default('Handpicked tours and activities rated by thousands of travelers. Book with free cancellation on most experiences.').meta({
        description: "Brief intro to the curated experiences",
    }),
    experiences: z.array(z.object({
        name: z.string().min(3).max(60).meta({ description: "Experience or tour name" }),
        description: z.string().min(10).max(120).meta({ description: "Brief description of the experience" }),
        duration: z.string().min(1).max(20).meta({ description: "Duration display such as 3h or 2h 30m" }),
        rating: z.number().min(1).max(5).meta({ description: "Average star rating from 1 to 5" }),
        review_count: z.number().meta({ description: "Total number of reviews" }),
        price_from: z.string().min(1).max(20).meta({ description: "Starting price with currency such as From USD 49" }),
        image: ImageSchema.meta({ description: "Product photo" }),
        booking_url: z.string().min(1).max(200).meta({ description: "URL to book this experience" }),
        flags: z.array(z.string()).meta({ description: "Product flags like Free cancellation, Selling fast, Private, Skip the line" }),
        cancellation: z.string().min(3).max(30).meta({ description: "Cancellation policy summary" }),
    })).min(3).max(6).default([
        {
            name: 'Private Colosseum Underground Tour',
            description: 'Explore restricted areas of the Colosseum with an expert archaeologist guide.',
            duration: '3h',
            rating: 4.8,
            review_count: 2341,
            price_from: 'From USD 89',
            image: { __image_url__: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=600&q=80', __image_prompt__: 'Colosseum Rome underground tour' },
            booking_url: 'https://viator.com',
            flags: ['Free cancellation', 'Skip the line', 'Private'],
            cancellation: 'Free cancellation',
        },
        {
            name: 'Sunset Sailing Amalfi Coast',
            description: 'Cruise past Positano and Ravello at golden hour with prosecco and local snacks.',
            duration: '4h',
            rating: 4.9,
            review_count: 876,
            price_from: 'From USD 125',
            image: { __image_url__: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=600&q=80', __image_prompt__: 'Amalfi Coast sunset sailing boat' },
            booking_url: 'https://viator.com',
            flags: ['Free cancellation', 'Selling fast'],
            cancellation: 'Free cancellation',
        },
        {
            name: 'Tuscany Wine & Cheese Day Trip',
            description: 'Visit two family vineyards in Chianti with tastings, lunch, and scenic drives.',
            duration: '8h',
            rating: 4.7,
            review_count: 1523,
            price_from: 'From USD 165',
            image: { __image_url__: 'https://images.unsplash.com/photo-1523464862212-d526026c5ff7?auto=format&fit=crop&w=600&q=80', __image_prompt__: 'Tuscany vineyard wine tasting' },
            booking_url: 'https://viator.com',
            flags: ['Free cancellation'],
            cancellation: 'Free cancellation',
        },
    ]).meta({ description: "List of bookable experiences" }),
})

export const Schema = experienceCardsSchema

export type ExperienceCardsData = z.infer<typeof experienceCardsSchema>

interface ExperienceCardsLayoutProps {
    data?: Partial<ExperienceCardsData>
}

const StarRating: React.FC<{ rating: number; count: number }> = ({ rating, count }) => (
    <div className="flex items-center gap-1">
        <div className="flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
                <svg key={i} className="w-3 h-3" viewBox="0 0 20 20" fill={i < Math.round(rating) ? 'var(--primary-color, #f59e0b)' : 'var(--stroke, #d1d5db)'}>
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            ))}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--background-text, #111827)' }}>{rating.toFixed(1)}</span>
        <span className="text-[10px]" style={{ color: 'var(--background-text, #9ca3af)' }}>({count.toLocaleString()})</span>
    </div>
)

const ExperienceCardsLayout: React.FC<ExperienceCardsLayoutProps> = ({ data: slideData }) => {
    const experiences = slideData?.experiences || []

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
                        <h1 className="text-[36px] font-bold leading-tight mb-1" style={{ color: 'var(--background-text, #111827)' }}>
                            {slideData?.title || 'Top Experiences'}
                        </h1>
                        <p className="text-[13px] leading-relaxed max-w-[600px]" style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                            {slideData?.description || 'Handpicked tours and activities rated by thousands of travelers.'}
                        </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
                        {experiences.map((exp, index) => (
                            <div
                                key={index}
                                className="rounded-xl overflow-hidden border flex flex-col"
                                style={{ borderColor: 'var(--stroke, #e5e7eb)', backgroundColor: 'var(--card-color, #ffffff)' }}
                            >
                                <div className="relative h-[130px] flex-shrink-0">
                                    <img
                                        src={exp.image?.__image_url__ || ''}
                                        alt={exp.image?.__image_prompt__ || exp.name || ''}
                                        className="w-full h-full object-cover"
                                    />
                                    {exp.duration && (
                                        <span
                                            className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/60 text-white"
                                        >
                                            {exp.duration}
                                        </span>
                                    )}
                                    {exp.flags?.includes('Selling fast') && (
                                        <span
                                            className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold"
                                            style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
                                        >
                                            Selling fast
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-col flex-1 p-3">
                                    <h3 className="text-[13px] font-bold leading-tight mb-1 line-clamp-2" style={{ color: 'var(--background-text, #111827)' }}>
                                        {exp.name}
                                    </h3>
                                    <StarRating rating={exp.rating ?? 4.5} count={exp.review_count ?? 0} />
                                    <p className="text-[10px] leading-snug mt-1 flex-1 line-clamp-2" style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                                        {exp.description}
                                    </p>
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {exp.flags?.filter(f => f !== 'Selling fast').map((flag, fi) => (
                                            <span
                                                key={fi}
                                                className="px-1.5 py-0.5 rounded text-[9px] font-semibold border"
                                                style={{
                                                    borderColor: flag === 'Free cancellation' ? '#22c55e' : 'var(--stroke, #e5e7eb)',
                                                    color: flag === 'Free cancellation' ? '#15803d' : 'var(--background-text, #6b7280)',
                                                    backgroundColor: flag === 'Free cancellation' ? '#f0fdf4' : 'var(--card-color, #f9fafb)',
                                                }}
                                            >
                                                {flag}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: 'var(--stroke, #e5e7eb)' }}>
                                        <span className="text-[13px] font-bold" style={{ color: 'var(--primary-color, #2563eb)' }}>
                                            {exp.price_from}
                                        </span>
                                        {exp.booking_url && (
                                            <span
                                                className="text-[10px] font-semibold px-2 py-1 rounded-md"
                                                style={{ backgroundColor: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                                            >
                                                Book now
                                            </span>
                                        )}
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

export default ExperienceCardsLayout
