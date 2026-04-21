import React from 'react'
import * as z from "zod";
import { IconSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-flight-info'
export const layoutName = 'FlightInfo'
export const layoutDescription = 'A slide layout displaying flight route cards with departure, arrival, airline, and duration information. Ideal for itinerary overviews in travel presentations.'

const flightSchema = z.object({
    title: z.string().min(3).max(40).default('Your Flight Details').meta({
        description: "Heading above the flight cards",
    }),
    flights: z.array(z.object({
        departure: z.string().min(3).max(30).default('New York (JFK)').meta({
            description: "Departure city and airport code",
        }),
        arrival: z.string().min(3).max(30).default('Tokyo (NRT)').meta({
            description: "Arrival city and airport code",
        }),
        airline: z.string().min(2).max(25).default('Japan Airlines').meta({
            description: "Airline name",
        }),
        duration: z.string().min(2).max(15).default('14h 20m').meta({
            description: "Total flight duration",
        }),
        departure_time: z.string().min(3).max(10).default('08:45 AM').meta({
            description: "Scheduled departure time",
        }),
        icon: IconSchema.default({
            __icon_url__: 'data:svg+xml,airplane',
            __icon_query__: 'airplane flight',
        }).meta({
            description: "Icon representing the flight or airline",
        }),
    })).min(1).max(3).default([
        {
            departure: 'New York (JFK)',
            arrival: 'Tokyo (NRT)',
            airline: 'Japan Airlines',
            duration: '14h 20m',
            departure_time: '08:45 AM',
            icon: { __icon_url__: 'data:svg+xml,airplane', __icon_query__: 'airplane flight' },
        },
        {
            departure: 'Tokyo (NRT)',
            arrival: 'Bali (DPS)',
            airline: 'ANA Airways',
            duration: '7h 35m',
            departure_time: '11:30 AM',
            icon: { __icon_url__: 'data:svg+xml,airplane', __icon_query__: 'airplane flight' },
        },
        {
            departure: 'Bali (DPS)',
            arrival: 'Sydney (SYD)',
            airline: 'Qantas',
            duration: '5h 50m',
            departure_time: '02:15 PM',
            icon: { __icon_url__: 'data:svg+xml,airplane', __icon_query__: 'airplane flight' },
        },
    ]).meta({
        description: "List of flight segments in the itinerary",
    }),
})

export const Schema = flightSchema

type FlightData = z.infer<typeof flightSchema>

interface FlightInfoLayoutProps {
    data?: Partial<FlightData>
}

const FlightInfoLayout: React.FC<FlightInfoLayoutProps> = ({ data: slideData }) => {
    const flights = slideData?.flights || []

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

                <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10" style={{ background: 'var(--primary-color, #2563eb)', filter: 'blur(80px)' }} />

                <div className="relative z-10 px-8 sm:px-12 lg:px-16 pt-14 pb-10 h-full flex flex-col">
                    <h1
                        className="text-3xl sm:text-4xl font-bold mb-8"
                        style={{ color: 'var(--background-text, #111827)' }}
                    >
                        {slideData?.title || 'Your Flight Details'}
                    </h1>

                    <div className="flex-1 flex flex-col justify-center gap-5">
                        {flights.map((flight, idx) => (
                            <div
                                key={idx}
                                className="rounded-xl px-8 py-5 flex items-center gap-6"
                                style={{
                                    background: 'var(--card-color, #f9fafb)',
                                    border: '1px solid var(--stroke, #e5e7eb)',
                                }}
                            >
                                <div className="flex-1 flex items-center gap-6">
                                    <div className="text-center min-w-[140px]">
                                        <p
                                            className="text-xs font-medium uppercase tracking-wide mb-1"
                                            style={{ color: 'var(--background-text, #9ca3af)' }}
                                        >
                                            Departure
                                        </p>
                                        <p
                                            className="text-lg font-bold"
                                            style={{ color: 'var(--background-text, #111827)' }}
                                        >
                                            {flight?.departure || 'Origin'}
                                        </p>
                                        <p
                                            className="text-sm font-medium mt-0.5"
                                            style={{ color: 'var(--primary-color, #2563eb)' }}
                                        >
                                            {flight?.departure_time || '08:45 AM'}
                                        </p>
                                    </div>

                                    <div className="flex-1 flex items-center gap-3">
                                        <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: 'var(--stroke, #d1d5db)' }} />
                                        <div className="flex flex-col items-center gap-1">
                                            <svg className="w-6 h-6" fill="var(--primary-color, #2563eb)" viewBox="0 0 24 24">
                                                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                                            </svg>
                                            <span
                                                className="text-xs font-semibold px-3 py-0.5 rounded-full"
                                                style={{
                                                    background: 'var(--primary-color, #2563eb)',
                                                    color: 'var(--primary-text, #ffffff)',
                                                }}
                                            >
                                                {flight?.duration || '14h 20m'}
                                            </span>
                                        </div>
                                        <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: 'var(--stroke, #d1d5db)' }} />
                                    </div>

                                    <div className="text-center min-w-[140px]">
                                        <p
                                            className="text-xs font-medium uppercase tracking-wide mb-1"
                                            style={{ color: 'var(--background-text, #9ca3af)' }}
                                        >
                                            Arrival
                                        </p>
                                        <p
                                            className="text-lg font-bold"
                                            style={{ color: 'var(--background-text, #111827)' }}
                                        >
                                            {flight?.arrival || 'Destination'}
                                        </p>
                                    </div>
                                </div>

                                <div
                                    className="border-l pl-6 min-w-[120px]"
                                    style={{ borderColor: 'var(--stroke, #e5e7eb)' }}
                                >
                                    <p
                                        className="text-xs font-medium uppercase tracking-wide mb-1"
                                        style={{ color: 'var(--background-text, #9ca3af)' }}
                                    >
                                        Airline
                                    </p>
                                    <p
                                        className="text-sm font-semibold"
                                        style={{ color: 'var(--background-text, #111827)' }}
                                    >
                                        {flight?.airline || 'Airline'}
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

export default FlightInfoLayout
