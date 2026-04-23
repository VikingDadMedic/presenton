import React from 'react'
import * as z from "zod";
import { IconSchema } from '../defaultSchemes';
import { RemoteSvgIcon } from '@/app/hooks/useRemoteSvgIcon';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-transportation'
export const layoutName = 'Getting Around'
export const layoutDescription = 'A transportation infographic showing local transit modes with costs, typical times, notes, and a walkability score banner.'

const transportSchema = z.object({
    title: z.string().min(3).max(50).default('Getting Around Lisbon').meta({
        description: "Main heading for the transportation slide",
    }),
    description: z.string().min(10).max(120).default('Lisbon is compact and well-connected. Here are your best options for navigating the city and beyond.').meta({
        description: "Brief intro to local transportation",
    }),
    modes: z.array(z.object({
        type: z.string().min(3).max(25).meta({ description: "Transport mode name" }),
        typical_cost: z.string().min(1).max(15).meta({ description: "Typical cost or price range" }),
        typical_time: z.string().min(2).max(20).meta({ description: "Typical travel time" }),
        notes: z.string().min(5).max(60).meta({ description: "Quick practical tip" }),
        icon: IconSchema.meta({ description: "Icon representing this transport mode" }),
    })).min(3).max(6).default([
        { type: 'Airport Transfer', typical_cost: '$15-25', typical_time: '35 min', notes: 'Aerobus runs every 20 min to city center', icon: { __icon_url__: '', __icon_query__: 'airplane arrival' } },
        { type: 'Metro', typical_cost: '$1.50', typical_time: 'Varies', notes: 'Viva Viagem card for unlimited rides', icon: { __icon_url__: '', __icon_query__: 'train metro' } },
        { type: 'Tram 28', typical_cost: '$3', typical_time: '40 min loop', notes: 'Iconic route through Alfama — go early to avoid crowds', icon: { __icon_url__: '', __icon_query__: 'tram trolley' } },
        { type: 'Ride-Hailing', typical_cost: '$5-12', typical_time: '10-20 min', notes: 'Bolt and Uber both widely available', icon: { __icon_url__: '', __icon_query__: 'car automobile' } },
    ]).meta({ description: "List of transportation modes" }),
    walking_score: z.string().min(3).max(30).default('Highly Walkable').meta({
        description: "Walkability assessment such as Highly Walkable, Moderate, Car Recommended",
    }),
})

export const Schema = transportSchema

export type TransportData = z.infer<typeof transportSchema>

interface TransportationInfoLayoutProps {
    data?: Partial<TransportData>
}

const TransportationInfoLayout: React.FC<TransportationInfoLayoutProps> = ({ data: slideData }) => {
    const modes = slideData?.modes || []

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
                    <div className="mb-5">
                        <h1 className="text-[36px] font-bold leading-tight mb-1" style={{ color: 'var(--background-text, #111827)' }}>
                            {slideData?.title || 'Getting Around Lisbon'}
                        </h1>
                        <p className="text-[14px] leading-relaxed max-w-[600px]" style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                            {slideData?.description || 'Lisbon is compact and well-connected. Here are your best options for navigating the city and beyond.'}
                        </p>
                    </div>

                    {/* Transport cards grid */}
                    <div className={`grid gap-4 flex-1 min-h-0 ${modes.length <= 3 ? 'grid-cols-3' : modes.length <= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                        {modes.map((mode, index) => (
                            <div
                                key={index}
                                className="rounded-xl p-4 flex flex-col items-center text-center border"
                                style={{ borderColor: 'var(--stroke, #e5e7eb)', backgroundColor: 'var(--card-color, #ffffff)' }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}>
                                    {mode.icon?.__icon_url__ ? (
                                        <RemoteSvgIcon url={mode.icon.__icon_url__} strokeColor="currentColor" className="w-5 h-5" color="var(--primary-text, #ffffff)" title={mode.icon.__icon_query__ || ''} />
                                    ) : (
                                        <svg className="w-5 h-5" fill="var(--primary-text, #ffffff)" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" /></svg>
                                    )}
                                </div>
                                <h3 className="text-[14px] font-bold mb-2" style={{ color: 'var(--background-text, #111827)' }}>{mode.type}</h3>
                                <div className="flex gap-2 mb-2">
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}>
                                        {mode.typical_cost}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border" style={{ borderColor: 'var(--stroke, #d1d5db)', color: 'var(--background-text, #374151)' }}>
                                        {mode.typical_time}
                                    </span>
                                </div>
                                <p className="text-[11px] leading-snug" style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                                    {mode.notes}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Walkability banner */}
                    <div className="mt-4 px-5 py-3 rounded-lg flex items-center gap-3" style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}>
                        <svg className="w-6 h-6 flex-shrink-0" fill="var(--primary-text, #ffffff)" viewBox="0 0 24 24">
                            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7" />
                        </svg>
                        <span className="text-[14px] font-semibold" style={{ color: 'var(--primary-text, #ffffff)' }}>
                            Walkability: {slideData?.walking_score || 'Highly Walkable'}
                        </span>
                    </div>
                </div>
            </div>
        </>
    )
}

export default TransportationInfoLayout
