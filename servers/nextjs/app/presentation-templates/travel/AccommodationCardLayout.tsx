import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-accommodation-card'
export const layoutName = 'AccommodationCard'
export const layoutDescription = 'A slide layout showcasing a hotel or resort with a large image, star rating, amenities, and pricing. Best used for accommodation highlights in travel presentations.'

const accommodationSchema = z.object({
    title: z.string().min(3).max(40).default('Where You Will Stay').meta({
        description: "Section heading above the hotel card",
    }),
    hotel_name: z.string().min(3).max(40).default('The Grand Serenity Resort & Spa').meta({
        description: "Name of the hotel or resort",
    }),
    star_rating: z.number().min(1).max(5).default(5).meta({
        description: "Hotel star rating from 1 to 5",
    }),
    location: z.string().min(3).max(40).default('Ubud, Bali, Indonesia').meta({
        description: "Location of the accommodation",
    }),
    price_per_night: z.string().min(1).max(15).default('$289/night').meta({
        description: "Price per night including currency symbol",
    }),
    description: z.string().min(10).max(150).default('A luxurious five-star retreat nestled in the heart of Ubud, offering breathtaking rice terrace views and world-class spa treatments.').meta({
        description: "Short description of the accommodation",
    }),
    amenities: z.array(
        z.string().min(2).max(25).meta({
            description: "Single amenity name",
        })
    ).min(3).max(6).default([
        'Infinity Pool',
        'Private Villa',
        'Spa & Wellness',
        'Fine Dining',
        'Airport Transfer',
    ]).meta({
        description: "List of key amenities offered by the accommodation",
    }),
    image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
        __image_prompt__: 'Luxury tropical resort pool with palm trees',
    }).meta({
        description: "Main image of the hotel or resort",
    }),
})

export const Schema = accommodationSchema

type AccommodationData = z.infer<typeof accommodationSchema>

interface AccommodationLayoutProps {
    data?: Partial<AccommodationData>
}

const AccommodationCardLayout: React.FC<AccommodationLayoutProps> = ({ data: slideData }) => {
    const amenities = slideData?.amenities || []
    const stars = slideData?.star_rating || 5

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

                <div className="relative z-10 px-8 sm:px-12 lg:px-16 pt-14 pb-10 h-full flex flex-col">
                    <h1
                        className="text-3xl sm:text-4xl font-bold mb-6"
                        style={{ color: 'var(--background-text, #111827)' }}
                    >
                        {slideData?.title || 'Where You Will Stay'}
                    </h1>

                    <div className="flex-1 grid grid-cols-2 gap-8 min-h-0">
                        <div className="relative rounded-xl overflow-hidden">
                            <img
                                src={slideData?.image?.__image_url__ || ''}
                                alt={slideData?.image?.__image_prompt__ || 'Hotel'}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                            <div
                                className="absolute bottom-4 right-4 px-4 py-2 rounded-lg text-lg font-bold"
                                style={{
                                    background: 'var(--primary-color, #2563eb)',
                                    color: 'var(--primary-text, #ffffff)',
                                }}
                            >
                                {slideData?.price_per_night || '$289/night'}
                            </div>
                        </div>

                        <div className="flex flex-col justify-center space-y-5">
                            <div>
                                <h2
                                    className="text-2xl sm:text-3xl font-bold"
                                    style={{ color: 'var(--background-text, #111827)' }}
                                >
                                    {slideData?.hotel_name || 'The Grand Serenity Resort & Spa'}
                                </h2>

                                <div className="flex items-center gap-1 mt-2">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <svg
                                            key={i}
                                            className="w-5 h-5"
                                            viewBox="0 0 20 20"
                                            fill={i < stars ? 'var(--primary-color, #2563eb)' : 'var(--stroke, #d1d5db)'}
                                        >
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="var(--primary-color, #2563eb)" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span
                                    className="text-sm font-medium"
                                    style={{ color: 'var(--background-text, #6b7280)' }}
                                >
                                    {slideData?.location || 'Ubud, Bali, Indonesia'}
                                </span>
                            </div>

                            <p
                                className="text-sm leading-relaxed"
                                style={{
                                    color: 'var(--background-text, #4b5563)',
                                    fontFamily: 'var(--body-font-family, Poppins)',
                                }}
                            >
                                {slideData?.description || 'A luxurious five-star retreat nestled in the heart of Ubud, offering breathtaking rice terrace views and world-class spa treatments.'}
                            </p>

                            <div className="flex flex-wrap gap-2">
                                {amenities.map((amenity, idx) => (
                                    <span
                                        key={idx}
                                        className="px-3 py-1.5 rounded-full text-xs font-medium"
                                        style={{
                                            background: 'var(--card-color, #f3f4f6)',
                                            color: 'var(--background-text, #374151)',
                                            border: '1px solid var(--stroke, #e5e7eb)',
                                        }}
                                    >
                                        {amenity}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default AccommodationCardLayout
