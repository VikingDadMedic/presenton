import React from 'react'
import * as z from "zod";
import { ImageSchema, IconSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-map'
export const layoutName = 'TravelMap'
export const layoutDescription = 'A slide layout showing a route map with numbered stops listed alongside a large map image. Ideal for multi-destination itineraries and travel route overviews.'

const travelMapSchema = z.object({
    title: z.string().min(3).max(50).default('Your Journey at a Glance').meta({
        description: "Main heading for the map slide",
    }),
    description: z.string().min(10).max(120).default('Follow the route through Southeast Asia, visiting ancient temples, pristine beaches, and vibrant cities.').meta({
        description: "Brief description of the overall route",
    }),
    stops: z.array(z.object({
        name: z.string().min(2).max(30).default('Bangkok').meta({
            description: "Name of the stop or destination",
        }),
        description: z.string().min(5).max(60).default('Explore ornate temples and bustling night markets').meta({
            description: "Short description of what to do at this stop",
        }),
        icon: IconSchema.default({
            __icon_url__: 'data:svg+xml,location-pin',
            __icon_query__: 'location marker',
        }).meta({
            description: "Icon representing this stop",
        }),
        image: ImageSchema.default({
            __image_url__: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=400&q=80',
            __image_prompt__: 'Beautiful travel destination landmark photo',
        }).meta({
            description: "Thumbnail image of this stop",
        }),
    })).min(2).max(6).default([
        {
            name: 'Bangkok',
            description: 'Explore ornate temples and bustling night markets',
            icon: { __icon_url__: 'data:svg+xml,location-pin', __icon_query__: 'temple landmark' },
            image: { __image_url__: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=400&q=80', __image_prompt__: 'Bangkok golden temple at sunset' },
        },
        {
            name: 'Chiang Mai',
            description: 'Trek through lush jungles and visit hill tribe villages',
            icon: { __icon_url__: 'data:svg+xml,location-pin', __icon_query__: 'mountain hiking' },
            image: { __image_url__: 'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=400&q=80', __image_prompt__: 'Chiang Mai temple in green mountains' },
        },
        {
            name: 'Siem Reap',
            description: 'Marvel at the ancient Angkor Wat temple complex',
            icon: { __icon_url__: 'data:svg+xml,location-pin', __icon_query__: 'ancient ruins' },
            image: { __image_url__: 'https://images.unsplash.com/photo-1539367628448-4bc5c9d171c8?auto=format&fit=crop&w=400&q=80', __image_prompt__: 'Angkor Wat temple at sunrise' },
        },
        {
            name: 'Ho Chi Minh City',
            description: 'Savor street food and discover French colonial heritage',
            icon: { __icon_url__: 'data:svg+xml,location-pin', __icon_query__: 'city building' },
            image: { __image_url__: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=400&q=80', __image_prompt__: 'Ho Chi Minh City street scene' },
        },
    ]).meta({
        description: "Ordered list of stops along the travel route",
    }),
    image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1200&q=80',
        __image_prompt__: 'Southeast Asia illustrated travel route map',
    }).meta({
        description: "Large map or route illustration image",
    }),
})

export const Schema = travelMapSchema

type TravelMapData = z.infer<typeof travelMapSchema>

interface TravelMapLayoutProps {
    data?: Partial<TravelMapData>
}

const TravelMapLayout: React.FC<TravelMapLayoutProps> = ({ data: slideData }) => {
    const stops = slideData?.stops || []

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

                <div className="relative z-10 px-8 sm:px-12 lg:px-16 pt-14 pb-8 h-full flex flex-col">
                    <div className="mb-4">
                        <h1
                            className="text-3xl sm:text-4xl font-bold"
                            style={{ color: 'var(--background-text, #111827)' }}
                        >
                            {slideData?.title || 'Your Journey at a Glance'}
                        </h1>
                        <p
                            className="text-sm mt-2 max-w-xl"
                            style={{
                                color: 'var(--background-text, #6b7280)',
                                fontFamily: 'var(--body-font-family, Poppins)',
                            }}
                        >
                            {slideData?.description || 'Follow the route through Southeast Asia, visiting ancient temples, pristine beaches, and vibrant cities.'}
                        </p>
                    </div>

                    <div className="flex-1 grid grid-cols-[340px_1fr] gap-6 min-h-0">
                        <div className="overflow-y-auto pr-2 space-y-3">
                            {stops.map((stop, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-start gap-3 p-3 rounded-lg"
                                    style={{
                                        background: 'var(--card-color, #f9fafb)',
                                        border: '1px solid var(--stroke, #e5e7eb)',
                                    }}
                                >
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                                        style={{
                                            background: 'var(--primary-color, #2563eb)',
                                            color: 'var(--primary-text, #ffffff)',
                                        }}
                                    >
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3
                                            className="text-sm font-bold"
                                            style={{ color: 'var(--background-text, #111827)' }}
                                        >
                                            {stop?.name || 'Destination'}
                                        </h3>
                                        <p
                                            className="text-xs mt-0.5 leading-relaxed"
                                            style={{
                                                color: 'var(--background-text, #6b7280)',
                                                fontFamily: 'var(--body-font-family, Poppins)',
                                            }}
                                        >
                                            {stop?.description || 'Explore this destination'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="relative rounded-xl overflow-hidden">
                            <img
                                src={slideData?.image?.__image_url__ || ''}
                                alt={slideData?.image?.__image_prompt__ || 'Travel route map'}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                            <div
                                className="absolute inset-0 opacity-10"
                                style={{ background: 'var(--primary-color, #2563eb)' }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default TravelMapLayout
