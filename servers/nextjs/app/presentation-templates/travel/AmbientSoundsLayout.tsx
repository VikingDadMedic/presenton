import React from 'react'
import * as z from "zod";
import { IconSchema } from '../defaultSchemes';
import { RemoteSvgIcon } from '@/app/hooks/useRemoteSvgIcon';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-ambient-sounds'
export const layoutName = 'The Sounds Of'
export const layoutDescription = 'An editorial, poetic slide painting the ambient soundscape of a destination across times of day. Icons and evocative text arranged in alternating layout.'

const ambientSoundsSchema = z.object({
    title: z.string().min(3).max(50).default('The Sounds of Marrakech').meta({
        description: "Main heading, typically 'The Sounds of [Destination]'",
    }),
    destination: z.string().min(2).max(30).default('Marrakech').meta({
        description: "Destination name",
    }),
    description: z.string().min(10).max(120).default('Close your eyes. Let the city wash over you, one sound at a time.').meta({
        description: "Brief evocative intro inviting the viewer to imagine the soundscape",
    }),
    sounds: z.array(z.object({
        time: z.string().min(3).max(20).meta({ description: "Time of day such as 5:00 AM, Midday, Dusk" }),
        sound: z.string().min(5).max(60).meta({ description: "Evocative description of an ambient sound at this time" }),
        icon: IconSchema.meta({ description: "Icon representing this sound or moment" }),
    })).min(4).max(8).default([
        { time: '5:00 AM', sound: 'The muezzin\'s call echoes across the sleeping medina.', icon: { __icon_url__: '', __icon_query__: 'moon crescent' } },
        { time: '7:30 AM', sound: 'Donkey hooves on cobblestone. The clink of mint tea glasses.', icon: { __icon_url__: '', __icon_query__: 'coffee cup tea' } },
        { time: 'Midday', sound: 'The rhythmic hammering of copper artisans in the souk.', icon: { __icon_url__: '', __icon_query__: 'hammer tool' } },
        { time: '4:00 PM', sound: 'Children laughing in Jemaa el-Fnaa as snake charmers play.', icon: { __icon_url__: '', __icon_query__: 'music note' } },
        { time: 'Sunset', sound: 'Sizzling tagine lids lifted, releasing clouds of cumin and saffron.', icon: { __icon_url__: '', __icon_query__: 'fire flame' } },
        { time: 'After Dark', sound: 'Gnawa drums pulse through lantern-lit alleyways.', icon: { __icon_url__: '', __icon_query__: 'drum music' } },
    ]).meta({ description: "Ambient sounds across different times of day" }),
})

export const Schema = ambientSoundsSchema

export type AmbientSoundsData = z.infer<typeof ambientSoundsSchema>

interface AmbientSoundsLayoutProps {
    data?: Partial<AmbientSoundsData>
}

const AmbientSoundsLayout: React.FC<AmbientSoundsLayoutProps> = ({ data: slideData }) => {
    const sounds = slideData?.sounds || []

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

                {/* Decorative sound-wave background */}
                <svg className="absolute inset-0 w-full h-full opacity-[0.04]" viewBox="0 0 1280 720" preserveAspectRatio="none">
                    {[180, 280, 380, 480].map((y, i) => (
                        <path key={i} d={`M0 ${y} Q320 ${y - 40 + i * 10} 640 ${y} T1280 ${y}`} fill="none" stroke="var(--primary-color, #2563eb)" strokeWidth="3" />
                    ))}
                </svg>

                <div className="relative z-10 flex flex-col h-full px-8 sm:px-12 lg:px-20 pt-14 pb-8">
                    {/* Header */}
                    <div className="text-center mb-6">
                        <h1 className="text-[36px] font-bold leading-tight mb-2" style={{ color: 'var(--background-text, #111827)' }}>
                            {slideData?.title || 'The Sounds of Marrakech'}
                        </h1>
                        <p className="text-[14px] leading-relaxed italic max-w-[500px] mx-auto" style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                            {slideData?.description || 'Close your eyes. Let the city wash over you, one sound at a time.'}
                        </p>
                    </div>

                    {/* Sound entries — alternating left/right */}
                    <div className="flex-1 flex flex-col justify-center gap-3 max-w-[900px] mx-auto w-full">
                        {sounds.map((entry, index) => {
                            const isLeft = index % 2 === 0
                            return (
                                <div
                                    key={index}
                                    className={`flex items-center gap-4 ${isLeft ? '' : 'flex-row-reverse'}`}
                                >
                                    <span
                                        className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex-shrink-0 min-w-[70px] text-center"
                                        style={{ background: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                                    >
                                        {entry.time}
                                    </span>
                                    <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: 'var(--card-color, #f3f4f6)' }}
                                    >
                                        {entry.icon?.__icon_url__ ? (
                                            <RemoteSvgIcon url={entry.icon.__icon_url__} strokeColor="currentColor" className="w-4 h-4" color="var(--primary-color, #2563eb)" title={entry.icon.__icon_query__ || ''} />
                                        ) : (
                                            <svg className="w-4 h-4" fill="var(--primary-color, #2563eb)" viewBox="0 0 24 24">
                                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                            </svg>
                                        )}
                                    </div>
                                    <p
                                        className={`text-[14px] leading-snug italic flex-1 ${isLeft ? 'text-left' : 'text-right'}`}
                                        style={{ color: 'var(--background-text, #374151)', fontFamily: 'var(--body-font-family, Poppins)' }}
                                    >
                                        {entry.sound}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </>
    )
}

export default AmbientSoundsLayout
