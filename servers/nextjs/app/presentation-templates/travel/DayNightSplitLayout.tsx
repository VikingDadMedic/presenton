import React from 'react'
import * as z from "zod";
import { ImageSchema, IconSchema } from '../defaultSchemes';
import { RemoteSvgIcon } from '@/app/hooks/useRemoteSvgIcon';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-day-night'
export const layoutName = 'Day vs Night'
export const layoutDescription = 'A dramatic 50/50 vertical split showing daytime experiences on the left and nightlife on the right, selling two destinations in one.'

const dayNightSchema = z.object({
    destination: z.string().min(2).max(30).default('Bangkok').meta({
        description: "Destination name displayed at the top center spanning both halves",
    }),
    day_title: z.string().min(3).max(30).default('By Day').meta({
        description: "Heading for the daytime section",
    }),
    night_title: z.string().min(3).max(30).default('By Night').meta({
        description: "Heading for the nighttime section",
    }),
    day_experiences: z.array(z.object({
        name: z.string().min(2).max(30).meta({ description: "Daytime activity name" }),
        description: z.string().min(5).max(60).meta({ description: "Brief description of the daytime activity" }),
        icon: IconSchema.meta({ description: "Icon for this daytime activity" }),
    })).min(2).max(4).default([
        { name: 'Temple Hopping', description: 'Explore ornate temples and golden spires in the morning light.', icon: { __icon_url__: '', __icon_query__: 'temple building' } },
        { name: 'Floating Markets', description: 'Cruise colourful canals lined with fresh fruit and local crafts.', icon: { __icon_url__: '', __icon_query__: 'boat market' } },
        { name: 'Street Food Trail', description: 'Taste pad thai and mango sticky rice from legendary vendors.', icon: { __icon_url__: '', __icon_query__: 'food bowl' } },
    ]).meta({ description: "List of daytime experiences" }),
    night_experiences: z.array(z.object({
        name: z.string().min(2).max(30).meta({ description: "Nighttime activity name" }),
        description: z.string().min(5).max(60).meta({ description: "Brief description of the nighttime activity" }),
        icon: IconSchema.meta({ description: "Icon for this nighttime activity" }),
    })).min(2).max(4).default([
        { name: 'Rooftop Cocktails', description: 'Sip craft cocktails with panoramic skyline views at sunset.', icon: { __icon_url__: '', __icon_query__: 'cocktail glass' } },
        { name: 'Night Markets', description: 'Browse designer knock-offs and handmade jewellery under neon lights.', icon: { __icon_url__: '', __icon_query__: 'shopping bag' } },
        { name: 'Muay Thai Live', description: 'Watch electrifying kickboxing bouts at Rajadamnern Stadium.', icon: { __icon_url__: '', __icon_query__: 'boxing gloves' } },
    ]).meta({ description: "List of nighttime experiences" }),
    day_image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=800&q=80',
        __image_prompt__: 'Bangkok golden temple bright sunny day',
    }).meta({ description: "Bright daytime destination photo" }),
    night_image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1563492065599-3520f775eeed?auto=format&fit=crop&w=800&q=80',
        __image_prompt__: 'Bangkok city skyline neon lights at night',
    }).meta({ description: "Atmospheric nighttime destination photo" }),
})

export const Schema = dayNightSchema

export type DayNightData = z.infer<typeof dayNightSchema>

interface DayNightSplitLayoutProps {
    data?: Partial<DayNightData>
}

const ExperienceCard: React.FC<{
    item: { name?: string; description?: string; icon?: { __icon_url__?: string; __icon_query__?: string } };
    dark?: boolean;
}> = ({ item, dark }) => (
    <div
        className="flex items-start gap-3 p-3 rounded-lg"
        style={{ backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'var(--card-color, #f9fafb)' }}
    >
        <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}
        >
            {item.icon?.__icon_url__ ? (
                <RemoteSvgIcon url={item.icon.__icon_url__} strokeColor="currentColor" className="w-4 h-4" color="var(--primary-text, #ffffff)" title={item.icon.__icon_query__ || ''} />
            ) : (
                <span className="text-[10px]" style={{ color: 'var(--primary-text, #ffffff)' }}>●</span>
            )}
        </div>
        <div className="flex-1 min-w-0">
            <h4 className="text-[13px] font-semibold mb-0.5" style={{ color: dark ? '#ffffff' : 'var(--background-text, #111827)' }}>{item.name}</h4>
            <p className="text-[11px] leading-snug" style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}>{item.description}</p>
        </div>
    </div>
)

const DayNightSplitLayout: React.FC<DayNightSplitLayoutProps> = ({ data: slideData }) => {
    const dayExperiences = slideData?.day_experiences || []
    const nightExperiences = slideData?.night_experiences || []

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

                <div className="absolute top-0 left-0 right-0 pt-14 pb-2 text-center z-20">
                    <h1 className="text-[32px] font-bold" style={{ color: 'var(--background-text, #111827)' }}>
                        {slideData?.destination || 'Bangkok'}
                    </h1>
                </div>

                <div className="relative z-10 flex h-full pt-[72px]">
                    {/* Day half */}
                    <div className="w-1/2 flex flex-col h-full" style={{ backgroundColor: 'var(--background-color, #ffffff)' }}>
                        <div className="relative h-[42%] flex-shrink-0">
                            <img src={slideData?.day_image?.__image_url__ || ''} alt={slideData?.day_image?.__image_prompt__ || ''} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/30" />
                            <span className="absolute bottom-3 left-4 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide" style={{ background: 'var(--primary-color, #f59e0b)', color: 'var(--primary-text, #ffffff)' }}>
                                ☀ {slideData?.day_title || 'By Day'}
                            </span>
                        </div>
                        <div className="flex-1 flex flex-col gap-2 px-5 py-3 overflow-hidden">
                            {dayExperiences.map((exp, i) => <ExperienceCard key={i} item={exp} />)}
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="w-px flex-shrink-0" style={{ backgroundColor: 'var(--stroke, #e5e7eb)' }} />

                    {/* Night half */}
                    <div className="w-1/2 flex flex-col h-full" style={{ backgroundColor: '#1a1a2e' }}>
                        <div className="relative h-[42%] flex-shrink-0">
                            <img src={slideData?.night_image?.__image_url__ || ''} alt={slideData?.night_image?.__image_prompt__ || ''} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#1a1a2e]/40" />
                            <span className="absolute bottom-3 left-4 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide" style={{ background: 'var(--primary-color, #6366f1)', color: 'var(--primary-text, #ffffff)' }}>
                                ✦ {slideData?.night_title || 'By Night'}
                            </span>
                        </div>
                        <div className="flex-1 flex flex-col gap-2 px-5 py-3 overflow-hidden">
                            {nightExperiences.map((exp, i) => <ExperienceCard key={i} item={exp} dark />)}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default DayNightSplitLayout
