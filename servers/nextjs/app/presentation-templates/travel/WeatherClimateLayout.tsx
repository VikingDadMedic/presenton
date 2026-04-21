import React from 'react'
import * as z from "zod";
import { IconSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-weather-climate'
export const layoutName = 'WeatherClimate'
export const layoutDescription = 'A slide layout presenting seasonal weather information with a best-time-to-visit banner and a grid of monthly climate cards. Useful for travel planning presentations.'

const weatherSchema = z.object({
    title: z.string().min(3).max(50).default('Weather & Best Time to Visit').meta({
        description: "Main heading for the weather slide",
    }),
    best_time: z.string().min(5).max(60).default('Best time to visit: April through October for warm, dry weather').meta({
        description: "Recommended travel period summary",
    }),
    description: z.string().min(10).max(120).default('The Mediterranean climate offers mild winters and hot summers, with peak sunshine from June to September.').meta({
        description: "Brief overview of the destination climate",
    }),
    months: z.array(z.object({
        name: z.string().min(3).max(10).default('June').meta({
            description: "Month name or abbreviation",
        }),
        avg_temp: z.string().min(2).max(10).default('28°C').meta({
            description: "Average temperature with unit",
        }),
        condition: z.string().min(3).max(20).default('Sunny').meta({
            description: "General weather condition",
        }),
        icon: IconSchema.default({
            __icon_url__: 'data:svg+xml,sun',
            __icon_query__: 'sunny weather',
        }).meta({
            description: "Weather condition icon",
        }),
    })).min(4).max(6).default([
        {
            name: 'April',
            avg_temp: '22°C',
            condition: 'Mild & Sunny',
            icon: { __icon_url__: 'data:svg+xml,sun-cloud', __icon_query__: 'partly cloudy' },
        },
        {
            name: 'June',
            avg_temp: '28°C',
            condition: 'Hot & Sunny',
            icon: { __icon_url__: 'data:svg+xml,sun', __icon_query__: 'sunny weather' },
        },
        {
            name: 'August',
            avg_temp: '31°C',
            condition: 'Peak Heat',
            icon: { __icon_url__: 'data:svg+xml,sun-hot', __icon_query__: 'hot sunny' },
        },
        {
            name: 'October',
            avg_temp: '24°C',
            condition: 'Warm & Clear',
            icon: { __icon_url__: 'data:svg+xml,sun-cloud', __icon_query__: 'clear sky' },
        },
        {
            name: 'December',
            avg_temp: '14°C',
            condition: 'Cool & Rainy',
            icon: { __icon_url__: 'data:svg+xml,rain', __icon_query__: 'rainy weather' },
        },
    ]).meta({
        description: "Monthly weather data cards",
    }),
})

export const Schema = weatherSchema

type WeatherData = z.infer<typeof weatherSchema>

interface WeatherClimateLayoutProps {
    data?: Partial<WeatherData>
}

const weatherIcons: Record<string, React.ReactElement> = {
    sunny: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
        </svg>
    ),
    cloudy: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path d="M6.34 15.34A4 4 0 018 8h.5A5.5 5.5 0 0119 9.5 3.5 3.5 0 0119.5 16H6.34z" />
        </svg>
    ),
    rainy: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path d="M6.34 13.34A4 4 0 018 6h.5A5.5 5.5 0 0119 7.5 3.5 3.5 0 0119.5 14H6.34zM8 18l-1 2m5-2l-1 2m5-2l-1 2" />
        </svg>
    ),
}

function getWeatherIcon(condition: string) {
    const lower = condition.toLowerCase()
    if (lower.includes('rain') || lower.includes('storm')) return weatherIcons.rainy
    if (lower.includes('cloud') || lower.includes('overcast')) return weatherIcons.cloudy
    return weatherIcons.sunny
}

const WeatherClimateLayout: React.FC<WeatherClimateLayoutProps> = ({ data: slideData }) => {
    const months = slideData?.months || []

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
                        className="text-3xl sm:text-4xl font-bold"
                        style={{ color: 'var(--background-text, #111827)' }}
                    >
                        {slideData?.title || 'Weather & Best Time to Visit'}
                    </h1>

                    <div
                        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg self-start"
                        style={{
                            background: 'var(--primary-color, #2563eb)',
                            color: 'var(--primary-text, #ffffff)',
                        }}
                    >
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm font-semibold">
                            {slideData?.best_time || 'Best time to visit: April through October for warm, dry weather'}
                        </span>
                    </div>

                    <p
                        className="text-sm mt-3 max-w-2xl"
                        style={{
                            color: 'var(--background-text, #6b7280)',
                            fontFamily: 'var(--body-font-family, Poppins)',
                        }}
                    >
                        {slideData?.description || 'The Mediterranean climate offers mild winters and hot summers, with peak sunshine from June to September.'}
                    </p>

                    <div className="flex-1 flex items-center mt-6">
                        <div className={`grid gap-5 w-full ${months.length <= 4 ? 'grid-cols-4' : months.length === 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>
                            {months.map((month, idx) => (
                                <div
                                    key={idx}
                                    className="rounded-xl p-5 flex flex-col items-center text-center gap-3"
                                    style={{
                                        background: 'var(--card-color, #f9fafb)',
                                        border: '1px solid var(--stroke, #e5e7eb)',
                                    }}
                                >
                                    <span
                                        className="text-sm font-bold uppercase tracking-wide"
                                        style={{ color: 'var(--background-text, #374151)' }}
                                    >
                                        {month?.name || 'Month'}
                                    </span>

                                    <div style={{ color: 'var(--primary-color, #2563eb)' }}>
                                        {getWeatherIcon(month?.condition || 'Sunny')}
                                    </div>

                                    <span
                                        className="text-2xl font-bold"
                                        style={{ color: 'var(--background-text, #111827)' }}
                                    >
                                        {month?.avg_temp || '25°C'}
                                    </span>

                                    <span
                                        className="text-xs font-medium px-2 py-1 rounded-full"
                                        style={{
                                            background: 'var(--primary-color, #2563eb)',
                                            color: 'var(--primary-text, #ffffff)',
                                            opacity: 0.9,
                                        }}
                                    >
                                        {month?.condition || 'Sunny'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default WeatherClimateLayout
