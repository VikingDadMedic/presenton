import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-itinerary-timeline'
export const layoutName = 'Itinerary Timeline'
export const layoutDescription = 'A multi-day visual timeline with connected dots along a horizontal axis, day cards with images below, and a prominent title. Great for trip overviews.'

const daySchema = z.object({
    day_number: z.number().min(1).max(30).meta({
        description: "Numeric day in the itinerary sequence",
    }),
    title: z.string().min(2).max(30).meta({
        description: "Short title for the day, e.g. city or theme",
    }),
    highlight: z.string().min(5).max(60).meta({
        description: "Key highlight or activity for that day",
    }),
    image: ImageSchema.meta({ description: "Day image" }),
})

const itineraryTimelineSchema = z.object({
    title: z.string().min(3).max(50).default('7-Day Japan Discovery').meta({
        description: "Main title for the itinerary timeline",
    }),
    days: z.array(daySchema).min(3).max(7).default([
        {
            day_number: 1,
            title: 'Tokyo',
            highlight: 'Shibuya crossing, Meiji Shrine, and Akihabara',
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=400&q=80',
                __image_prompt__: 'Tokyo cityscape at night with neon lights'
            }
        },
        {
            day_number: 2,
            title: 'Hakone',
            highlight: 'Hot springs, Lake Ashi cruise, Mt. Fuji views',
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=400&q=80',
                __image_prompt__: 'Mount Fuji with lake reflection and torii gate'
            }
        },
        {
            day_number: 3,
            title: 'Kyoto',
            highlight: 'Fushimi Inari, bamboo grove, tea ceremony',
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=400&q=80',
                __image_prompt__: 'Fushimi Inari shrine thousand red torii gates Kyoto'
            }
        },
        {
            day_number: 4,
            title: 'Nara',
            highlight: 'Todai-ji temple and friendly deer park',
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=400&q=80',
                __image_prompt__: 'Nara deer park with temple in background Japan'
            }
        },
        {
            day_number: 5,
            title: 'Osaka',
            highlight: 'Dotonbori street food and castle visit',
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1590559899731-a382839e5549?auto=format&fit=crop&w=400&q=80',
                __image_prompt__: 'Osaka Dotonbori canal with neon signs at night'
            }
        },
    ]).meta({
        description: "Ordered list of days with titles, highlights, and images",
    }),
})

export const Schema = itineraryTimelineSchema

export type ItineraryTimelineData = z.infer<typeof itineraryTimelineSchema>

interface ItineraryTimelineLayoutProps {
    data?: Partial<ItineraryTimelineData>
}

const ItineraryTimelineLayout: React.FC<ItineraryTimelineLayoutProps> = ({ data: slideData }) => {
    const days = slideData?.days || []

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

                {/* Main Content */}
                <div className="relative z-10 flex flex-col h-full px-8 sm:px-12 lg:px-16 pt-14 pb-8">
                    {/* Title */}
                    <div className="text-center mb-8">
                        <h1
                            className="text-3xl sm:text-4xl lg:text-5xl font-bold"
                            style={{ color: 'var(--background-text,#111827)' }}
                        >
                            {slideData?.title || '7-Day Japan Discovery'}
                        </h1>
                        <div className="w-16 h-1 mx-auto mt-3" style={{ background: 'var(--primary-color,#2563eb)' }} />
                    </div>

                    {/* Timeline Section */}
                    <div className="flex-1 relative flex flex-col justify-center">
                        {/* Horizontal Line */}
                        <div className="relative w-full px-8">
                            <div
                                className="absolute left-8 right-8 h-[3px] top-1/2 -translate-y-1/2"
                                style={{ background: 'var(--stroke,#e5e7eb)' }}
                            />

                            {/* Day Nodes */}
                            <div className="relative flex justify-between">
                                {days.map((day, index) => {
                                    const isAbove = index % 2 === 0
                                    return (
                                        <div key={index} className="flex flex-col items-center relative" style={{ width: `${100 / days.length}%` }}>
                                            {isAbove ? (
                                                <>
                                                    {/* Card Above */}
                                                    <div
                                                        className="rounded-lg overflow-hidden shadow-md mb-3 w-full max-w-[180px]"
                                                        style={{ background: 'var(--card-color,#f9fafb)', border: '1px solid var(--stroke,#e5e7eb)' }}
                                                    >
                                                        <div className="h-[80px] overflow-hidden">
                                                            <img
                                                                src={day.image?.__image_url__ || ''}
                                                                alt={day.image?.__image_prompt__ || day.title}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                        <div className="p-2">
                                                            <h3
                                                                className="text-xs sm:text-sm font-semibold"
                                                                style={{ color: 'var(--background-text,#111827)' }}
                                                            >
                                                                {day.title}
                                                            </h3>
                                                            <p
                                                                className="text-[10px] leading-tight mt-0.5"
                                                                style={{ color: 'var(--background-text,#4b5563)', fontFamily: 'var(--body-font-family,Poppins)' }}
                                                            >
                                                                {day.highlight}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Connector */}
                                                    <div className="w-0.5 h-4" style={{ background: 'var(--primary-color,#2563eb)' }} />

                                                    {/* Dot */}
                                                    <div
                                                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
                                                        style={{ background: 'var(--primary-color,#2563eb)', color: 'var(--primary-text,#ffffff)' }}
                                                    >
                                                        {day.day_number}
                                                    </div>

                                                    <div className="h-[140px]" />
                                                </>
                                            ) : (
                                                <>
                                                    <div className="h-[140px]" />

                                                    {/* Dot */}
                                                    <div
                                                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
                                                        style={{ background: 'var(--primary-color,#2563eb)', color: 'var(--primary-text,#ffffff)' }}
                                                    >
                                                        {day.day_number}
                                                    </div>

                                                    {/* Connector */}
                                                    <div className="w-0.5 h-4" style={{ background: 'var(--primary-color,#2563eb)' }} />

                                                    {/* Card Below */}
                                                    <div
                                                        className="rounded-lg overflow-hidden shadow-md mt-3 w-full max-w-[180px]"
                                                        style={{ background: 'var(--card-color,#f9fafb)', border: '1px solid var(--stroke,#e5e7eb)' }}
                                                    >
                                                        <div className="h-[80px] overflow-hidden">
                                                            <img
                                                                src={day.image?.__image_url__ || ''}
                                                                alt={day.image?.__image_prompt__ || day.title}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                        <div className="p-2">
                                                            <h3
                                                                className="text-xs sm:text-sm font-semibold"
                                                                style={{ color: 'var(--background-text,#111827)' }}
                                                            >
                                                                {day.title}
                                                            </h3>
                                                            <p
                                                                className="text-[10px] leading-tight mt-0.5"
                                                                style={{ color: 'var(--background-text,#4b5563)', fontFamily: 'var(--body-font-family,Poppins)' }}
                                                            >
                                                                {day.highlight}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default ItineraryTimelineLayout
