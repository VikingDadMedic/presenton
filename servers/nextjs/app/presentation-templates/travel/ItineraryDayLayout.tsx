import React from 'react'
import * as z from "zod";
import { ImageSchema, IconSchema } from '../defaultSchemes';
import { RemoteSvgIcon } from '@/app/hooks/useRemoteSvgIcon';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-itinerary-day'
export const layoutName = 'Itinerary Day'
export const layoutDescription = 'A single-day itinerary card showing a day badge, title, timed activities with icons on the left, and a large destination image on the right.'

const activitySchema = z.object({
    time: z.string().min(2).max(15).meta({
        description: "Time slot for the activity, e.g. 9:00 AM",
    }),
    name: z.string().min(2).max(40).meta({
        description: "Name of the activity or excursion",
    }),
    description: z.string().min(5).max(80).meta({
        description: "Brief description of what the activity involves",
    }),
    icon: IconSchema.meta({ description: "Activity icon" }),
    image: ImageSchema.meta({ description: "Activity image" }),
})

const itineraryDaySchema = z.object({
    day_number: z.number().min(1).max(30).default(1).meta({
        description: "Numeric day of the itinerary",
    }),
    title: z.string().min(3).max(40).default('Arrival & Old Town').meta({
        description: "Title summarizing the day's theme",
    }),
    description: z.string().min(5).max(120).default('Settle in and explore the cobblestone streets, historic landmarks, and local cuisine of the old quarter.').meta({
        description: "Overview of what the day entails",
    }),
    activities: z.array(activitySchema).min(2).max(5).default([
        {
            time: '9:00 AM',
            name: 'Airport Transfer & Check-In',
            description: 'Private transfer to the boutique hotel with a welcome drink.',
            icon: {
                __icon_url__: 'https://presenton-public.s3.ap-southeast-1.amazonaws.com/static/icons/bold/checks-bold.svg',
                __icon_query__: 'airplane arrival'
            },
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80',
                __image_prompt__: 'Luxury boutique hotel lobby with tropical plants'
            }
        },
        {
            time: '12:00 PM',
            name: 'Old Town Walking Tour',
            description: 'Guided stroll through historic plazas, churches, and artisan workshops.',
            icon: {
                __icon_url__: 'https://presenton-public.s3.ap-southeast-1.amazonaws.com/static/icons/bold/fediverse-logo-bold.svg',
                __icon_query__: 'walking tour map'
            },
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=400&q=80',
                __image_prompt__: 'European old town cobblestone street with colorful buildings'
            }
        },
        {
            time: '7:00 PM',
            name: 'Sunset Dinner Cruise',
            description: 'Enjoy local seafood aboard a traditional boat at golden hour.',
            icon: {
                __icon_url__: 'https://presenton-public.s3.ap-southeast-1.amazonaws.com/static/icons/bold/checks-bold.svg',
                __icon_query__: 'restaurant dining'
            },
            image: {
                __image_url__: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80',
                __image_prompt__: 'Sunset dinner cruise on Mediterranean sea'
            }
        },
    ]).meta({
        description: "Ordered list of timed activities for the day",
    }),
})

export const Schema = itineraryDaySchema

export type ItineraryDayData = z.infer<typeof itineraryDaySchema>

interface ItineraryDayLayoutProps {
    data?: Partial<ItineraryDayData>
}

const ItineraryDayLayout: React.FC<ItineraryDayLayoutProps> = ({ data: slideData }) => {
    const activities = slideData?.activities || []
    const firstActivityImage = activities[0]?.image?.__image_url__

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
                <div className="relative z-10 flex h-full px-8 sm:px-12 lg:px-20 pt-14 pb-8 gap-8">
                    {/* Left Side - Day Info & Activities */}
                    <div className="flex-1 flex flex-col">
                        {/* Day Badge */}
                        <div className="flex items-center gap-3 mb-4">
                            <span
                                className="inline-flex items-center justify-center w-12 h-12 rounded-full text-lg font-bold"
                                style={{ background: 'var(--primary-color,#2563eb)', color: 'var(--primary-text,#ffffff)' }}
                            >
                                {slideData?.day_number || 1}
                            </span>
                            <div>
                                <span
                                    className="text-xs font-semibold uppercase tracking-wider"
                                    style={{ color: 'var(--primary-color,#2563eb)' }}
                                >
                                    Day {slideData?.day_number || 1}
                                </span>
                                <h1
                                    className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight"
                                    style={{ color: 'var(--background-text,#111827)' }}
                                >
                                    {slideData?.title || 'Arrival & Old Town'}
                                </h1>
                            </div>
                        </div>

                        <p
                            className="text-sm sm:text-base mb-5 max-w-[500px]"
                            style={{ color: 'var(--background-text,#4b5563)', fontFamily: 'var(--body-font-family,Poppins)' }}
                        >
                            {slideData?.description || 'Settle in and explore the cobblestone streets, historic landmarks, and local cuisine of the old quarter.'}
                        </p>

                        {/* Activities Timeline */}
                        <div className="flex-1 space-y-4 overflow-hidden">
                            {activities.map((activity, index) => (
                                <div key={index} className="flex items-start gap-3">
                                    {/* Timeline Dot & Line */}
                                    <div className="flex flex-col items-center flex-shrink-0">
                                        <div
                                            className="w-10 h-10 rounded-lg flex items-center justify-center shadow-sm"
                                            style={{ background: 'var(--primary-color,#2563eb)' }}
                                        >
                                            <RemoteSvgIcon
                                                url={activity.icon?.__icon_url__}
                                                strokeColor="currentColor"
                                                className="w-5 h-5"
                                                color="var(--primary-text, #ffffff)"
                                                title={activity.icon?.__icon_query__}
                                            />
                                        </div>
                                        {index < activities.length - 1 && (
                                            <div className="w-0.5 flex-1 min-h-[16px]" style={{ background: 'var(--stroke,#e5e7eb)' }} />
                                        )}
                                    </div>

                                    {/* Activity Content */}
                                    <div className="flex-1 pb-2">
                                        <span
                                            className="text-xs font-semibold"
                                            style={{ color: 'var(--primary-color,#2563eb)' }}
                                        >
                                            {activity.time}
                                        </span>
                                        <h3
                                            className="text-sm sm:text-base font-semibold"
                                            style={{ color: 'var(--background-text,#111827)' }}
                                        >
                                            {activity.name}
                                        </h3>
                                        <p
                                            className="text-xs sm:text-sm"
                                            style={{ color: 'var(--background-text,#4b5563)', fontFamily: 'var(--body-font-family,Poppins)' }}
                                        >
                                            {activity.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Side - Image */}
                    <div className="flex-1 flex items-center justify-center">
                        <div className="w-full h-full max-h-[580px] rounded-2xl overflow-hidden shadow-lg">
                            <img
                                src={firstActivityImage || ''}
                                alt={slideData?.title || 'Day itinerary'}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default ItineraryDayLayout
